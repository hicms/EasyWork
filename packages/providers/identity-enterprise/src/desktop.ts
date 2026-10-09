import { Service, type Context } from '@deepseek-ai/cordis';
import type { EnterpriseService, EnterpriseRequest, IdentityResolutionContext, IdentityService } from 'workdsh-contracts';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-api-session-controller';
import { EnterpriseMemberIdentity } from './member-identity.js';
import { DesktopAuthority, type EnterpriseDesktopConfig } from './desktop-authority.js';
import { DesktopBodySync, observeDesktopSessions } from './desktop-body-sync.js';
export type { EnterpriseDesktopConfig } from './desktop-authority.js';

declare module '@deepseek-ai/cordis' { interface Context { workdshIdentity: IdentityService; workdshEnterprise: EnterpriseService } }
type SessionAccess = { inspect: Context['sessionController']['inspect'] };

/** Explicit enterprise Desktop composition. It cannot authenticate as a personal identity. */
export default class EnterpriseDesktopIdentity extends Service implements IdentityService {
  static inject = ['connection'];
  readonly id = 'workdsh-enterprise-desktop';
  private identity?: EnterpriseMemberIdentity;
  private readonly authority: DesktopAuthority;
  private sync?: DesktopBodySync;
  private syncError = '正文同步组件尚未就绪。';

  constructor(ctx: Context, config: EnterpriseDesktopConfig) {
    super(ctx, 'workdshIdentity');
    this.authority = new DesktopAuthority(Object.freeze({ ...config }));
    ctx.plugin(EnterpriseTransport, this);

    ctx.effect(() => () => { this.identity?.revoke(); this.authority.close(); this.sync?.close(); }, 'workdsh.enterprise-desktop.authority');
    const register = (path: string, methods: Array<'GET' | 'POST'>, fetch: (request: Request) => Promise<Response>) => {
      ctx.effect(() => ctx.connection.fetch.register({ path, methods, requestBody: 'buffered', fetch }), `workdsh.enterprise-desktop.${path}`);
    };
    const denied = () => Response.json({ local: true, error: '企业认证未确认，请在 Desktop 重新登录。' }, { status: 401, headers: { 'cache-control': 'no-store' } });
    register('/api/auth/me', ['GET'], async request => {
      try {
        await this.resolve(undefined, request.signal);
        const account = await this.authority.account(request.signal);
        return Response.json({ ...account, desktop: true }, { headers: { 'cache-control': 'no-store' } });
      } catch { this.identity?.revoke(); return denied(); }
    });
    register('/api/auth/logout', ['POST'], async request => {
      try {
        const value = await this.authority.logout(request.signal); this.identity?.revoke(); this.sync?.close();
        return Response.json(value, { headers: { 'cache-control': 'no-store' } });
      } catch { this.identity?.revoke(); this.authority.close(); this.sync?.close(); return denied(); }
    });
    register('/api/workdsh-enterprise-sync', ['GET', 'POST'], async request => {
      try {
        await this.resolve(undefined, request.signal);
        if (!this.sync) return Response.json({ error: this.syncError }, { status: 503, headers: { 'cache-control': 'no-store' } });
        if (request.method === 'POST') {
          const raw = await request.text(); if (raw.length > 1000) return Response.json({ error: '请求过大。' }, { status: 413 });
          const input = JSON.parse(raw) as Record<string, unknown>;
          if (input.action === 'retry' && Object.keys(input).length === 1) await this.sync.retry();
          else if (input.action === 'delete' && typeof input.sessionId === 'string' && Object.keys(input).length === 2) await this.sync.deleteCloud(input.sessionId);
          else return Response.json({ error: '请求无效。' }, { status: 400 });
        }
        return Response.json(await this.sync.status(request.signal), { headers: { 'cache-control': 'no-store' } });
      } catch { return Response.json({ error: '同步未确认，请检查企业登录和网络。' }, { status: 502, headers: { 'cache-control': 'no-store' } }); }
    });
  }
  async [Service.init](): Promise<void> {
    this.identity = await EnterpriseMemberIdentity.admit(signal => this.authority.verify(signal));
    this.ctx.inject(['sessionController', 'workdshSessionAccess'], async ready => {
      try {
        const access = (ready as Context & { workdshSessionAccess: SessionAccess }).workdshSessionAccess;
        const sync = await DesktopBodySync.create(this.authority, (id, signal) => access.inspect(id, signal));
        this.sync = sync; observeDesktopSessions(ready, sync);
        ready.effect(() => () => { if (this.sync === sync) this.sync = undefined; }, 'workdsh.enterprise-desktop.sync-owner');
      } catch { this.syncError = '正文同步初始化失败；请检查企业认证及受保护的本机同步文件。'; }
    });
  }
  async enterpriseIdentity(signal?: AbortSignal) {
    await this.resolve(undefined, signal);
    return { memberId: this.authority.config.principalId, organizationId: this.authority.config.organizationId };
  }
  async enterpriseRequest<T = unknown>(input: EnterpriseRequest): Promise<T> {
    await this.resolve(undefined, input.signal);
    return this.authority.extension<T>(input);
  }
  collaborationBinding(signal?: AbortSignal) { return this.authority.collaborationBinding(signal); }
  profile() { if (!this.identity) throw new Error('Enterprise Desktop authentication required'); return this.identity.profile(); }
  membership(organizationId: string, principalId: string) { return this.identity?.membership(organizationId, principalId); }
  async resolve(evidence?: IdentityResolutionContext, signal?: AbortSignal) {
    if (!this.identity) throw new Error('Enterprise Desktop authentication required');
    return this.identity.resolve(evidence, signal);
  }
}

/** Public plugin dependency. Lifecycle is scoped to the installed enterprise identity. */
class EnterpriseTransport extends Service implements EnterpriseService {
  constructor(ctx: Context, private readonly owner: EnterpriseDesktopIdentity) { super(ctx, 'workdshEnterprise'); }
  identity(signal?: AbortSignal) { return this.owner.enterpriseIdentity(signal); }
  request<T = unknown>(input: EnterpriseRequest): Promise<T> { return this.owner.enterpriseRequest<T>(input); }
}
