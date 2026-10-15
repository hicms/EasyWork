import { record, serviceOrigin } from './shared.ts';
export class AskError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export class AskClient {
  private readonly fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch) { this.fetcher = fetcher; }
  async request(path: string, options: { token?: string; body?: unknown; method?: string; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetcher(serviceOrigin + path, {
        method: options.method ?? (options.body === undefined ? 'GET' : 'POST'), redirect: 'error',
        headers: { accept: 'application/json', ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(options.token ? { authorization: 'Bearer ' + options.token } : {}) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 15_000), ...(options.signal ? [options.signal] : [])]),
      });
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      throw new AskError(0, '暂时无法连接模型服务，请重试。');
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (path === '/api/auth/register') {
        if (response.status === 400) throw new AskError(400, '注册失败，请检查邮箱、密码和邀请码；邀请码可能无效或已使用。');
        if (response.status === 409) throw new AskError(409, '该邮箱已注册，请直接登录。');
      }
      throw new AskError(response.status, response.status === 401 ? '登录已失效或账号密码错误，请重新登录。' : '模型服务请求失败，请稍后重试。');
    }
    if (response.status === 204) return null;
    const reader = response.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    if (!reader) throw new AskError(502, '模型服务返回了空响应。');
    try {
      while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
        if (size > 4 * 1024 * 1024) { await reader.cancel(); throw new AskError(502, '模型服务响应过大。'); } chunks.push(next.value); }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new AskError(502, '模型服务返回了无效响应。'); }
  }
}
export interface Grant { readonly token: string; readonly expiresAt: number; readonly user: { readonly id: string; readonly email: string }; }
export function parseGrant(value: unknown): Grant | undefined {
  if (!record(value) || typeof value.token !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.token)
    || value.token.length > 16_384 || !Number.isSafeInteger(value.expiresAt) || !record(value.user)
    || typeof value.user.id !== 'string' || !value.user.id || typeof value.user.email !== 'string' || !value.user.email) return undefined;
  return { token: value.token, expiresAt: value.expiresAt as number, user: { id: value.user.id, email: value.user.email } };
}
