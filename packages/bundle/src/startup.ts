import { createRequire } from 'node:module';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { brandStartupIndex, readStartupEntry } from './startup-branding.mjs';

type StartupWebServer = {
  register(route: { kind: 'exact'; path: string; handler(req: IncomingMessage, res: ServerResponse): void }): () => void;
  tapIndex(transform: (html: string) => string): () => void;
};

export function registerStartupBranding(ctx: Context): void {
  ctx.inject(['webServer'], async scope => {
    const index = createRequire(import.meta.url).resolve('@deepseek-ai/dsh-web-frontend/dist/index.html');
    const entry = await readStartupEntry(index);
    const web = scope.get('webServer') as StartupWebServer;
    scope.effect(() => web.register({
      kind: 'exact', path: entry.pathname,
      handler(req, res) {
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return; }
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
        res.end(req.method === 'HEAD' ? undefined : entry.source);
      },
    }), 'easywork.startup.script');
    scope.effect(() => web.tapIndex(html => brandStartupIndex(html, entry)), 'easywork.startup.index');
  });
}
