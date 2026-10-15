import type { Context } from '@deepseek-ai/cordis';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-llm';
import type {} from '@deepseek-ai/dsh-agent-default-model';
import type {} from '@deepseek-ai/dsh-fs';
import { resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm';
import { ModelsAccount } from './account.ts';
import { AskError } from './ask-client.ts';
import { ModelAdapter } from './model-adapter.ts';
import { reconcileDefaultModel } from './defaults.ts';
import { createSearchProvider } from './web-search.ts';
import { createFetchProvider } from './web-fetch.ts';
import { managementPath, providerId, record } from './shared.ts';
export { ModelAdapter } from './model-adapter.ts';
export const name = 'easywork-plugin-models';
export const inject = ['credentials', 'llm', 'connection', 'agentDefaultModel', 'web'];

export function apply(ctx: Context): void {
  const key = credentialKey(name, 'ask-service');
  let notify = () => {};
  const account = new ModelsAccount({
    read: async () => { const entry = await ctx.credentials.readRecord(key); return entry?.kind === 'grant' ? entry.payload : undefined; },
    change: async mutate => {
      await ctx.credentials.modifyRecord(key, async current => {
        const next = mutate(current?.kind === 'grant' ? current.payload : undefined);
        return next === undefined ? undefined : { kind: 'grant', payload: next as never };
      });
    },
  }, undefined, async models => {
    notify();
    await reconcileDefaultModel(ctx.agentDefaultModel, models);
  });
  const adapter = new ModelAdapter(account, {
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(attachments, path => ctx.get('fs')?.processPathFromHostPath(path), ref),
  });
  const registration = ctx.llm.registerAdapter([providerId], adapter);
  notify = () => registration.replace([providerId]);
  ctx.web.registerSearchProvider(createSearchProvider(account));
  ctx.web.registerFetchProvider(createFetchProvider(account));
  ctx.on('credentials/record-updated', updated => {
    if (updated === key) void account.state().then(() => notify()).catch(() => {});
  });
  ctx.effect(() => () => { account.dispose(); registration(); }, 'easywork.models.account');
  const unregister = ctx.connection.fetch.register({
    path: managementPath, methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      const headers = { 'cache-control': 'no-store' };
      try {
        const raw = await request.text();
        if (raw.length > 8192) throw new AskError(400, '请求过大。');
        let body: unknown;
        try { body = JSON.parse(raw); } catch { throw new AskError(400, '请求格式无效。'); }
        if (!record(body)) throw new AskError(400, '请求格式无效。');
        const payload = record(body.payload) ? body.payload : {};
        let value;
        if (body.endpoint === 'state') value = await account.state();
        else if (body.endpoint === 'refresh') value = await account.state(true);
        else if (body.endpoint === 'logout') value = await account.logout();
        else if (body.endpoint === 'login' && typeof payload.email === 'string' && typeof payload.password === 'string') value = await account.login(payload.email, payload.password, request.signal);
        else throw new AskError(400, '请求格式无效。');
        return Response.json({ ok: true, value }, { headers });
      } catch (error) {
        const message = error instanceof AskError ? error.message : '账号或模型操作失败，请重试。';
        return Response.json({ ok: false, error: { code: 'easywork/models', message } }, { headers, status: error instanceof AskError ? error.status || 503 : 500 });
      }
    },
  });
  ctx.effect(() => unregister, 'easywork.models.connection');
  // Headless startup only restores this plugin's credential; it never prompts or calls a model.
  void account.state().catch(() => {});
}
