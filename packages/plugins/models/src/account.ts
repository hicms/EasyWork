import { AskClient, AskError, parseGrant, type Grant } from './ask-client.ts';
import { randomUUID } from 'node:crypto';
import type { WebFetchRequest, WebSearchRequest } from '@deepseek-ai/dsh-web';
import { parseCatalog } from './catalog.ts';
import { record, serviceOrigin, type ModelsSnapshot, type ServiceModel } from './shared.ts';

/** The implementation uses the official credential record's cross-process lock. */
export interface AccountRecords {
  read(): Promise<unknown>;
  change(mutate: (current: unknown) => unknown | undefined): Promise<void>;
}
interface AccountBinding { readonly grant: Grant; readonly signal: AbortSignal; }
export interface ModelBinding extends AccountBinding { readonly model: ServiceModel; }
function waitFor<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export class ModelsAccount {
  private readonly records: AccountRecords;
  private readonly api: AskClient;
  private readonly changed: (models: readonly ServiceModel[]) => Promise<void>;
  private readonly lifetime = new AbortController();
  private active = new AbortController();
  private grant: Grant | undefined;
  private models: readonly ServiceModel[] = [];
  private error: string | null = null;
  private generation = 0;
  private mutation = 0;
  private loadedAt = 0;
  private loading: Promise<ModelsSnapshot> | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;

  constructor(records: AccountRecords, api = new AskClient(), changed: (models: readonly ServiceModel[]) => Promise<void> = async () => {}) {
    this.records = records; this.api = api; this.changed = changed;
  }
  view(): ModelsSnapshot {
    return { origin: serviceOrigin, user: this.grant?.user ?? null, expiresAt: this.grant?.expiresAt ?? null, models: this.models, error: this.error };
  }
  private stored(value: unknown): Grant | undefined {
    return record(value) && value.origin === serviceOrigin ? parseGrant(value) : undefined;
  }
  private activate(grant: Grant | undefined): void {
    if (this.grant?.token === grant?.token) return;
    this.active.abort(new AskError(401, '模型服务账号已变更，请重新发送。')); this.active = new AbortController();
    this.generation++; this.loading = undefined;
    clearTimeout(this.expiry); this.grant = grant; this.models = []; this.loadedAt = 0;
    if (grant) this.scheduleExpiry(grant);
  }
  private scheduleExpiry(grant: Grant): void {
    const delay = Math.min(Math.max(grant.expiresAt - Date.now(), 1), 2_147_483_647);
    this.expiry = setTimeout(() => {
      if (this.grant?.token !== grant.token) return;
      if (grant.expiresAt > Date.now()) this.scheduleExpiry(grant);
      else void this.expire(grant.token).catch(() => { this.error = '登录状态更新失败，请重试。'; });
    }, delay);
    this.expiry.unref?.();
  }
  private async readGrant(): Promise<Grant | undefined> {
    const grant = this.stored(await this.records.read());
    this.activate(grant);
    if (grant && grant.expiresAt <= Date.now()) { await this.expire(grant.token); return undefined; }
    return grant;
  }
  async expire(token: string): Promise<void> {
    await this.records.change(current => this.stored(current)?.token === token
      ? { origin: serviceOrigin, signedOut: true, ...(record(current) && typeof current.operation === 'string' ? { operation: current.operation } : {}) } : undefined);
    if (this.grant?.token !== token) return;
    this.generation++; this.activate(undefined); this.error = '登录已过期，请重新登录。';
    await this.changed([]);
  }
  async state(refresh = false): Promise<ModelsSnapshot> {
    if (this.lifetime.signal.aborted) throw this.lifetime.signal.reason;
    const grant = await this.readGrant();
    if (!grant) return this.view();
    if (!refresh && Date.now() - this.loadedAt < 60_000) return this.view();
    if (this.loading) return this.loading;
    const operation = this.load(grant); this.loading = operation;
    try { return await operation; } finally { if (this.loading === operation) this.loading = undefined; }
  }
  private async load(grant: Grant): Promise<ModelsSnapshot> {
    const generation = this.generation;
    const signal = AbortSignal.any([this.lifetime.signal, this.active.signal]);
    try {
      const user = await this.api.request('/api/auth/me', { token: grant.token, signal });
      if (!record(user) || user.id !== grant.user.id || user.email !== grant.user.email) throw new AskError(401, '账号状态已变更，请重新登录。');
      const models = parseCatalog(await this.api.request('/api/models', { token: grant.token, signal }));
      if (generation !== this.generation || this.grant?.token !== grant.token) return this.view();
      this.models = models; this.loadedAt = Date.now(); this.error = null;
      await this.changed(models);
    } catch (error) {
      if (generation !== this.generation || this.grant?.token !== grant.token) return this.view();
      if (error instanceof AskError && error.status === 401) await this.expire(grant.token);
      else this.error = error instanceof AskError ? error.message : '模型目录加载失败，请重试。';
    }
    return this.view();
  }
  async login(email: string, password: string, signal?: AbortSignal): Promise<ModelsSnapshot> {
    if (!email.trim() || email.length > 254 || !password || password.length > 1024) throw new AskError(400, '请填写登录邮箱和密码。');
    const mutation = ++this.mutation; const operation = randomUUID();
    // A locked reservation orders login/logout across every Host sharing this Profile.
    await this.records.change(current => ({ origin: serviceOrigin, ...this.stored(current), operation }));
    const response = await this.api.request('/api/auth/login', { body: { email: email.trim(), password }, signal: AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : [])]) });
    const grant = parseGrant(response);
    if (!grant || grant.expiresAt <= Date.now()) throw new AskError(502, '模型服务返回了无效登录状态。');
    if (mutation !== this.mutation || this.lifetime.signal.aborted || signal?.aborted) {
      await this.api.request('/api/auth/logout', { token: grant.token, method: 'POST' }).catch(() => {});
      throw new AskError(409, '登录操作已取消，请重试。');
    }
    let committed = false;
    try {
      await this.records.change(current => {
        if (mutation !== this.mutation || !record(current) || current.operation !== operation) return undefined;
        committed = true; return { origin: serviceOrigin, ...grant, operation };
      });
    } catch (error) {
      await this.api.request('/api/auth/logout', { token: grant.token, method: 'POST' }).catch(() => {});
      throw error;
    }
    if (!committed || mutation !== this.mutation) {
      await this.api.request('/api/auth/logout', { token: grant.token, method: 'POST' }).catch(() => {});
      throw new AskError(409, '账号状态已变更，登录已取消。');
    }
    this.activate(grant); this.error = null; this.loading = undefined;
    return this.state(true);
  }
  async logout(): Promise<ModelsSnapshot> {
    const mutation = ++this.mutation; let grant: Grant | undefined;
    await this.records.change(current => { grant = this.stored(current); return { origin: serviceOrigin, signedOut: true, operation: randomUUID() }; });
    if (mutation === this.mutation) {
      this.activate(undefined); this.error = null; this.loading = undefined;
      await this.changed([]);
    }
    if (grant) {
      try { await this.api.request('/api/auth/logout', { token: grant.token, method: 'POST', signal: this.lifetime.signal }); }
      catch (error) { if (mutation === this.mutation && !(error instanceof AskError && error.status === 401)) this.error = '本机已退出，服务端注销暂未确认。'; }
    }
    return this.view();
  }
  async capture(modelId: string, signal?: AbortSignal): Promise<ModelBinding> {
    signal?.throwIfAborted();
    await waitFor(this.state(), signal);
    const binding = await this.captureAccount(signal);
    const model = this.models.find(model => model.id === modelId);
    if (!model) throw new AskError(404, this.error ?? '所选模型已不可用，请刷新模型列表。');
    return { ...binding, model };
  }
  private async captureAccount(signal?: AbortSignal): Promise<AccountBinding> {
    this.lifetime.signal.throwIfAborted(); signal?.throwIfAborted();
    const grant = await waitFor(this.readGrant(), signal);
    this.lifetime.signal.throwIfAborted(); signal?.throwIfAborted();
    if (!grant) throw new AskError(401, '请先登录 EasyWork 模型服务。');
    return { grant, signal: AbortSignal.any([this.lifetime.signal, this.active.signal]) };
  }
  async assertCurrent(binding: AccountBinding): Promise<void> {
    binding.signal.throwIfAborted();
    const current = await this.readGrant();
    binding.signal.throwIfAborted();
    if (current?.token !== binding.grant.token) throw new AskError(401, '模型服务账号已变更，请重新发送。');
  }
  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<unknown> {
    return this.webRequest('/api/search', request, 35_000, signal);
  }
  async fetch(request: WebFetchRequest, signal?: AbortSignal): Promise<unknown> {
    return this.webRequest('/api/fetch', request, 25_000, signal);
  }
  private async webRequest(path: string, request: WebSearchRequest | WebFetchRequest, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
    const binding = await this.captureAccount(signal);
    const combined = AbortSignal.any([binding.signal, ...(signal ? [signal] : [])]);
    try {
      const result = await this.api.request(path, { token: binding.grant.token, body: request, signal: combined, timeoutMs });
      combined.throwIfAborted();
      await this.assertCurrent(binding);
      combined.throwIfAborted();
      return result;
    } catch (error) {
      if (error instanceof AskError && error.status === 401) await this.expire(binding.grant.token);
      throw error;
    }
  }
  dispose(): void {
    clearTimeout(this.expiry); this.generation++; this.mutation++; this.lifetime.abort(new Error('EasyWork 模型服务已卸载。')); this.active.abort();
    this.grant = undefined; this.models = [];
  }
}
