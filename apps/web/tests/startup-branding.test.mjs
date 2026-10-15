import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { build } from 'esbuild';
import { brandStartupIndex, brandStartupScript, readStartupEntry } from '../../../packages/bundle/src/startup-branding.mjs';
import { APP_ORIGIN } from '../../desktop/src/startup-contract.ts';
import { yaml } from '../scripts/official-web-clients.mjs';

const dsh = createRequire(realpathSync(new URL('../node_modules/@deepseek-ai/dsh/package.json', import.meta.url)));
const webAnchor = dsh.resolve('@deepseek-ai/dsh-web-app/package.json');
const webRequire = createRequire(webAnchor);
const indexPath = webRequire.resolve('@deepseek-ai/dsh-web-frontend/dist/index.html');
const frontend = dirname(indexPath);
const html = await readFile(indexPath, 'utf8');
const entry = await readStartupEntry(indexPath);
const original = await readFile(join(frontend, entry.originalSrc), 'utf8');

async function currentModule(path, options = {}) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false,
    platform: 'node', format: 'cjs', ...options,
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, {
    module, exports: module.exports, require: createRequire(import.meta.url),
    URL, Request, Response, Headers, ReadableStream, Uint8Array, Buffer, performance,
  });
  return module.exports;
}
const { CarrierWeb } = await currentModule('../../desktop/src/carrier-web.ts');
const { registerStartupBranding } = await currentModule('../../../packages/bundle/src/startup.ts', {
  define: { 'import.meta.url': JSON.stringify(pathToFileURL(webAnchor).href) },
});

test('the shared Profile declares and locks the same official frontend it serves', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../../packages/bundle/package.json', import.meta.url), 'utf8'));
  const official = JSON.parse(await readFile(webRequire.resolve('@deepseek-ai/dsh-web-frontend/package.json'), 'utf8'));
  const lock = yaml.parse(await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8'));
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-web-frontend'], official.version);
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh-web-frontend'], official.version);
  assert.equal(lock.importers['../../packages/bundle'].devDependencies['@deepseek-ai/dsh-web-frontend'].specifier, official.version);
  assert.equal(lock.importers['../../packages/bundle'].devDependencies['@deepseek-ai/dsh-web-frontend'].version, official.version);
});

test('published startup script changes only the two requested literals before its first execution', () => {
  assert.equal(entry.source, original.replace('"HARNESS"', '"EasyWork"').replace('"Loading plugins…"', '"正在加载插件…"'));
  const page = {};
  runInNewContext(brandStartupScript('globalThis.firstFrame = ["HARNESS", "Loading plugins…"];'), page);
  assert.deepEqual(Array.from(page.firstFrame), ['EasyWork', '正在加载插件…']);
  const branded = brandStartupIndex(html, entry);
  assert.ok(branded.includes(entry.src));
  assert.equal(new URL(entry.src, 'https://easywork.invalid/').pathname, entry.pathname);
  assert.equal(dirname(entry.pathname), dirname(new URL(entry.originalSrc, 'https://easywork.invalid/').pathname), 'relative imports retain their directory');
});

test('changed upstream copy or module entry fails explicitly instead of leaking the old brand', () => {
  assert.throws(() => brandStartupScript('"HARNESS";'), /expected one/);
  assert.throws(() => brandStartupScript('"HARNESS"; "HARNESS"; "Loading plugins…";'), /expected one/);
  assert.throws(() => brandStartupIndex(html.replace('type="module"', 'type="text/javascript"'), entry), /module entry changed/);
  assert.throws(() => brandStartupIndex(html.replace(entry.originalSrc, './assets/other.js'), entry), /index entry changed/);
});

test('Desktop serves branded boot bytes before Host readiness and leaves official assets unchanged', async () => {
  const carrier = new CarrierWeb(frontend);
  const index = await carrier.request(new Request(`${APP_ORIGIN}/`));
  const servedHtml = await index.text();
  assert.equal(index.status, 200);
  assert.ok(servedHtml.includes(entry.src));
  assert.ok(servedHtml.includes('globalThis.__DSH_BOOT_READY__ = Promise.withResolvers()'));
  const address = `${APP_ORIGIN}${entry.pathname}`;
  const script = await carrier.request(new Request(address));
  assert.equal(await script.text(), entry.source);
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.equal(script.headers.get('cache-control'), 'no-store');
  const head = await carrier.request(new Request(address, { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await carrier.request(new Request(address, { method: 'POST' }))).status, 405);
  const native = await carrier.request(new Request(`${APP_ORIGIN}/${entry.originalSrc.slice(2)}`));
  assert.equal(await native.text(), original, 'the native asset URL retains its original bytes');
  assert.equal(await readFile(indexPath, 'utf8'), html);
  assert.equal(await readFile(join(frontend, entry.originalSrc), 'utf8'), original);
});

test('Web registers one branded entry and index transform with GET, HEAD and managed disposal', async t => {
  const routes = new Map();
  const transforms = new Set();
  const disposers = [];
  let initialization;
  const web = {
    register(route) { routes.set(route.path, route); return () => routes.delete(route.path); },
    tapIndex(transform) { transforms.add(transform); return () => transforms.delete(transform); },
  };
  const ctx = {
    inject(names, initialize) { assert.deepEqual(Array.from(names), ['webServer']); initialization = initialize(ctx); },
    get(name) { assert.equal(name, 'webServer'); return web; },
    effect(factory) { const dispose = factory(); disposers.push(dispose); return dispose; },
  };
  const dispose = () => disposers.splice(0).reverse().forEach(fn => fn());
  t.after(dispose);
  registerStartupBranding(ctx);
  await initialization;
  assert.equal(routes.size, 1);
  assert.equal(transforms.size, 1);
  assert.equal([...transforms][0](html), brandStartupIndex(html, entry));
  const route = routes.get(entry.pathname);
  function request(method) {
    const result = {};
    route.handler({ method }, {
      writeHead(status, headers) { Object.assign(result, { status, headers }); },
      end(body) { result.body = body; },
    });
    return result;
  }
  assert.equal(request('GET').body, entry.source);
  assert.equal(request('GET').headers['cache-control'], 'no-store');
  assert.equal(request('HEAD').status, 200);
  assert.equal(request('HEAD').body, undefined);
  assert.equal(request('POST').status, 405);
  dispose();
  assert.equal(routes.size, 0);
  assert.equal(transforms.size, 0);
});
