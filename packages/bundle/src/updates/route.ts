import type { Context } from '@deepseek-ai/cordis';
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { PluginUpdates } from './service.js';
import { updatePath } from './contracts.js';

/** Exact authenticated Connection route; service and network code are loaded only when the page calls it. */
export function registerPluginUpdates(ctx: Context): void {
  ctx.inject(['pluginManager', 'profileContext', 'subprocess'], scope => {
    let service: Promise<PluginUpdates> | undefined;
    const connection = (scope as Context & { connection: HostConnectionHandle }).connection;
    const unregister = connection.fetch.register({ path: updatePath, methods: ['POST'], requestBody: 'buffered', fetch: async request => {
      try {
        const text = await request.text();
        if (text.length > 12000) return Response.json({ error: '请求过大' }, { status: 400 });
        const body = JSON.parse(text);
        service ??= import('./service.js').then(({ PluginUpdates }) => new PluginUpdates(scope));
        const updates = await service;
        if (body.action === 'configure') {
          if (typeof body.url !== 'string' || typeof body.publicKey !== 'string') throw new Error('Invalid source');
          await updates.configure({ url: body.url, publicKey: body.publicKey });
        } else if (body.action === 'check') await updates.check();
        else if (body.action === 'update' && typeof body.name === 'string' && typeof body.candidateId === 'string') await updates.update(body.name, body.candidateId);
        else if (body.action === 'cancel') await updates.cancel();
        else if (body.action !== 'list') return Response.json({ error: '无效操作' }, { status: 400 });
        return Response.json(await updates.view(), { headers: { 'cache-control': 'no-store' } });
      } catch { return Response.json({ error: '操作未完成，请等待已有操作结束或检查来源后重试。' }, { status: 409 }); }
    } });
    scope.effect(() => async () => { unregister(); await (await service)?.dispose(); }, 'easywork.plugin-updates');
  });
}
