import type { EnterpriseRequest } from 'workdsh-contracts';
import { readProtectedFile } from './protected-file.js';
import { isAbsolute } from 'node:path';
import type { VerifiedMember } from './request-context.js';

export interface EnterpriseDesktopConfig {
  authFile: string;
  principalId: string;
  organizationId: string;
  deviceId: string;
}
interface AuthorityFile extends Omit<EnterpriseDesktopConfig, 'authFile'> {
  authorityUrl: string;
  authorityKey: string;
  backendUrl: string;
}
export interface DesktopAccount {
  id: string; organizationId: string; organizationName: string; displayName: string; email: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER'; mustChangePassword: false;
  deviceId: string; backendUrl: string;
}
export class DesktopAuthorityError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[\w-]{1,160}$/.test(value);
export function enterpriseOrigin(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname))))
    throw new Error('Invalid enterprise backend origin');
  return url.origin;
}

/** Host-only capability to the owning Electron Main. No member token leaves Main. */
export class DesktopAuthority {
  private binding?: Readonly<AuthorityFile>;
  private readonly lifetime = new AbortController();
  constructor(readonly config: Readonly<EnterpriseDesktopConfig>) {
    if (!isAbsolute(config.authFile) || !identifier(config.principalId) || !identifier(config.organizationId) || !identifier(config.deviceId))
      throw new Error('Enterprise Desktop requires a protected authFile and fixed member, organization and device');
  }
  close(): void { this.lifetime.abort(); }
  get namespace(): string {
    if (!this.binding) throw new Error('Enterprise Desktop authentication required');
    return JSON.stringify([this.binding.backendUrl, this.config.organizationId, this.config.principalId, this.config.deviceId]);
  }
  private async credentials(): Promise<Readonly<AuthorityFile>> {
    const value = JSON.parse(await readProtectedFile(this.config.authFile, 8192)) as AuthorityFile;
    if (value.principalId !== this.config.principalId || value.organizationId !== this.config.organizationId || value.deviceId !== this.config.deviceId ||
        typeof value.authorityKey !== 'string' || !/^[a-f0-9]{64,128}$/i.test(value.authorityKey) || typeof value.backendUrl !== 'string')
      throw new Error('Enterprise Desktop authority binding mismatch');
    const url = new URL(value.authorityUrl);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/' || url.username || url.password || url.search || url.hash)
      throw new Error('Enterprise Desktop authority must be a literal loopback origin');
    const normalized = Object.freeze({ authorityUrl: url.origin, authorityKey: value.authorityKey,
      backendUrl: enterpriseOrigin(value.backendUrl), principalId: value.principalId, organizationId: value.organizationId, deviceId: value.deviceId });
    if (this.binding && JSON.stringify(this.binding) !== JSON.stringify(normalized)) throw new Error('Enterprise Desktop authority changed; sign in again');
    return this.binding ??= normalized;
  }
  private async request(path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown, signal?: AbortSignal): Promise<unknown> {
    this.lifetime.signal.throwIfAborted(); signal?.throwIfAborted();
    const binding = await this.credentials();
    try {
      const response = await fetch(new URL(path, binding.authorityUrl), { method, redirect: 'error',
        headers: { authorization: `Bearer ${binding.authorityKey}`, accept: 'application/json', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]) });
      if (!response.ok) throw new DesktopAuthorityError(`Enterprise Desktop request rejected (${response.status})`, response.status);
      const value: unknown = await response.json();
      if (path !== '/auth/logout') await this.credentials();
      this.lifetime.signal.throwIfAborted(); signal?.throwIfAborted();
      return value;
    } catch (error) {
      if (error instanceof DesktopAuthorityError) throw error;
      throw new DesktopAuthorityError('Enterprise Desktop authority unavailable or changed');
    }
  }
  redactProtectedText(text: string): string {
    if (!this.binding) throw new Error('Enterprise Desktop authentication required');
    return text.replaceAll(this.binding.authorityKey, '[credential redacted]');
  }
  async account(signal?: AbortSignal): Promise<DesktopAccount> {
    const value = await this.request('/auth/me', 'GET', undefined, signal) as Partial<DesktopAccount>;
    if (!value || value.id !== this.config.principalId || value.organizationId !== this.config.organizationId || value.deviceId !== this.config.deviceId ||
        typeof value.backendUrl !== 'string' || value.backendUrl !== this.binding?.backendUrl || value.mustChangePassword !== false || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(value.role)) ||
        typeof value.displayName !== 'string' || !value.displayName || typeof value.email !== 'string' || !value.email ||
        typeof value.organizationName !== 'string' || !value.organizationName)
      throw new DesktopAuthorityError('Enterprise Desktop member changed or authentication expired');
    // Do not relay extra backend fields or capabilities into the Client.
    return { id: value.id, organizationId: value.organizationId, deviceId: value.deviceId, backendUrl: value.backendUrl,
      role: value.role!, mustChangePassword: false, displayName: value.displayName, email: value.email, organizationName: value.organizationName };
  }
  async verify(signal?: AbortSignal): Promise<VerifiedMember> {
    const value = await this.account(signal);
    return { principalId: value.id, organizationId: value.organizationId, active: true,
      role: value.role === 'OWNER' ? 'owner' : value.role === 'ADMIN' ? 'admin' : 'member' };
  }
  async body(method: 'GET' | 'POST' | 'DELETE', sessionId: string, body?: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!identifier(sessionId)) throw new Error('Invalid Desktop Session identity');
    if (method === 'POST' && (!body || typeof body !== 'object' || (body as Record<string, unknown>).deviceId !== this.config.deviceId || (body as Record<string, unknown>).sessionId !== sessionId)) throw new Error('Enterprise Desktop body binding mismatch');
    await this.account(signal);
    const path = method === 'POST' ? '/visible-sessions/ingest' : `/visible-sessions/ingest?sessionId=${encodeURIComponent(sessionId)}`;
    const value = await this.request(path, method, body, signal);
    await this.account(signal); return value;
  }
  async extension<T = unknown>(input: EnterpriseRequest): Promise<T> {
    const identifier = /^[a-z][a-z0-9-]{0,63}$/;
    if (!identifier.test(input.plugin) || !identifier.test(input.operation)) throw new Error('Invalid enterprise extension operation');
    const path = `/api/extensions/${input.plugin}/${input.operation}`;
    if (!['GET', 'POST'].includes(input.method) || (input.method === 'GET' && input.body !== undefined)) throw new Error('Invalid enterprise extension request');
    await this.account(input.signal);
    const value = await this.request(path, input.method, input.body, input.signal);
    await this.account(input.signal);
    return value as T;
  }
  async collaborationBinding(signal?: AbortSignal): Promise<{url:string;authorization:string}> {
    await this.account(signal);
    const binding = await this.credentials();
    return {url:binding.authorityUrl,authorization:`Bearer ${binding.authorityKey}`};
  }
  async logout(signal?: AbortSignal): Promise<{ local: true }> {
    // Even when backend revocation cannot be confirmed, Main owns local stop/cleanup.
    const value = await this.request('/auth/logout', 'POST', {}, signal) as { local?: boolean };
    if (value?.local !== true) throw new Error('Enterprise Desktop logout response invalid');
    this.close(); return { local: true };
  }
}
