import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { officialWebClients, parseOfficialPatch } from '../scripts/official-web-clients.mjs';
import { PRODUCT_PACKAGES, RELEASE_PACKAGES, PACKAGE_DIRECTORIES } from '../../desktop/scripts/easywork-package-boundary.mjs';
import { replacedOfficialIds, verifyEasyWorkClientGraph } from '../../../scripts/easywork-model-policy.mjs';

const dshRequire = createRequire(realpathSync(new URL('../node_modules/@deepseek-ai/dsh/package.json', import.meta.url)));
const baseRequire = createRequire(dshRequire.resolve('@deepseek-ai/dsh-base/package.json'));
const { composeEntries, loadOverlayPatches } = await import(pathToFileURL(dshRequire.resolve('@deepseek-ai/dsh-app-boot')).href);

test('shared Profile routes native tools without Sync Center or the official search service', () => {
  const base = loadOverlayPatches('test', join(dirname(dshRequire.resolve('@deepseek-ai/dsh-base/package.json')), 'cordis.patch.yml'));
  const webManifest = dshRequire.resolve('@deepseek-ai/dsh-web-app/package.json');
  const webLayers = JSON.parse(readFileSync(webManifest, 'utf8')).dsh.bundle.patch.map(file => loadOverlayPatches('test', join(dirname(webManifest), file)));
  const owned = parseOfficialPatch(readFileSync(new URL('../../../packages/plugins/models/cordis.patch.yml', import.meta.url), 'utf8')).toJSON();
  const rows = composeEntries([base, ...webLayers, owned]);
  const byId = id => rows.find(row => row.id === id);
  assert.equal(byId('web-search-deepseek').disabled, true);
  assert.deepEqual(byId('web').config, { searchProvider: 'easywork', fetchProvider: 'easywork' });
  assert.equal(byId('web-fetch-http').disabled, true);
  assert.equal(byId('tool-web').disabled, true, 'Web keeps native tools scoped to the official Agent preset');
  const tool = byId('preset-standard').config.plugins.find(row => row.id === 'tool-web');
  assert.ok(tool); assert.notEqual(tool.disabled, true);
  assert.notEqual(tool.config.search, false); assert.equal(tool.config.fetch, true);
  assert.ok(tool.config.searchTimeoutMs > 35_000);
  assert.ok((tool.config.fetchTimeoutMs ?? 30_000) > 25_000);
  assert.equal(rows.some(row => row.name === '@local/dsh-model-sync'), false);
  assert.equal(rows.filter(row => row.id === 'easywork-models').length, 1);
});

test('actual native web tools execute server search and Exa extraction through the shared EasyWork account', async t => {
  const { Context } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/cordis')).href);
  const { WebRuntime } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-web')).href);
  const { applyWebSearchTool, applyWebFetchTool } = await import(pathToFileURL(baseRequire.resolve('@deepseek-ai/dsh-tool-web')).href);
  const { createSearchProvider } = await import('../../../packages/plugins/models/src/web-search.ts');
  const { createFetchProvider } = await import('../../../packages/plugins/models/src/web-fetch.ts');
  const { ModelsAccount } = await import('../../../packages/plugins/models/src/account.ts');
  const { AskClient } = await import('../../../packages/plugins/models/src/ask-client.ts');
  const { memoryRecords, token } = await import('../../../packages/plugins/models/tests/fixture.ts');
  const ctx = new Context(); t.after(() => ctx.fiber.dispose());
  const web = new WebRuntime(ctx, { searchProvider: 'easywork', fetchProvider: 'easywork' });
  const tools = new Map(); const calls = [];
  const account = new ModelsAccount(memoryRecords({ origin: 'https://ask.vigoai.cn', token, expiresAt: Date.now() + 60_000, user: { id: 'test', email: 'test@example.com' } }), new AskClient(async (input, init) => {
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + token);
    calls.push({ url: String(input), body: JSON.parse(init.body) });
    if (String(input) === 'https://ask.vigoai.cn/api/search') return Response.json({ results: [{ title: 'Example', url: 'https://example.com/page', snippet: 'Search result' }] });
    assert.equal(String(input), 'https://ask.vigoai.cn/api/fetch');
    return Response.json({ url: 'https://example.com/page', content: 'Exa extracted public page', truncated: false });
  }));
  t.after(() => account.dispose());
  web.registerSearchProvider(createSearchProvider(account));
  const removeFetch = web.registerFetchProvider(createFetchProvider(account));
  const nativeContext = { web, tools: { register: tool => tools.set(tool.name, tool) }, systemPrompt: { section() {}, getSectionOrder: () => 1 } };
  applyWebSearchTool(nativeContext, 8, 4, 60_000, true); applyWebFetchTool(nativeContext, 30_000, 200_000);
  assert.deepEqual([...tools.keys()], ['web_search', 'web_fetch']);
  const search = await tools.get('web_search').execute({ queries: ['example'] }, { signal: new AbortController().signal });
  assert.equal(search.sources[0].url, 'https://example.com/page');
  const url = 'https://example.com/page';
  const fetched = await tools.get('web_fetch').execute({ url }, { signal: new AbortController().signal });
  assert.equal(fetched.statusCode, 200); assert.match(fetched.body.content, /Exa extracted public page/);
  assert.match(fetched.body.content, /source HTTP status unknown/);
  assert.deepEqual(calls, [
    { url: 'https://ask.vigoai.cn/api/search', body: { query: 'example', maxResults: 8 } },
    { url: 'https://ask.vigoai.cn/api/fetch', body: { url } },
  ]);
  removeFetch(); await assert.rejects(web.fetch({ url }), error => error.code === 'WEB_PROVIDER_CONFIGURED_MISSING');
});

test('shared Profile replaces account/model owners while retaining the complete upstream reference and other clients', async () => {
  const official = await officialWebClients();
  const patch = parseOfficialPatch(readFileSync(new URL('../../../packages/plugins/models/cordis.patch.yml', import.meta.url), 'utf8')).toJSON();
  assert.equal(new Set(replacedOfficialIds).size, 10);
  for (const id of ['deepseek-account', 'account-controller', 'llm-deepseek', 'llm-deepseek-account', 'llm-pi-ai', 'ui-settings-account', 'ui-settings-models', 'ui-model-selection']) assert.ok(patch.some(row => row.id === id && row.disabled === true));
  const ids = new Set(official.clients.filter(client => !replacedOfficialIds.includes(client.id)).map(client => client.package));
  ids.add('easywork-plugin-models'); verifyEasyWorkClientGraph(official.clients, ids);
  ids.add('@deepseek-ai/dsh-client-ui-model-selection'); assert.throws(() => verifyEasyWorkClientGraph(official.clients, ids), /still active/);
  ids.delete('@deepseek-ai/dsh-client-ui-model-selection'); ids.delete('@deepseek-ai/dsh-client-ui-conversation');
  assert.throws(() => verifyEasyWorkClientGraph(official.clients, ids), /missing at runtime/);
  for (const names of [PRODUCT_PACKAGES, RELEASE_PACKAGES]) assert.ok(names.includes('easywork-plugin-models'));
  assert.equal(PACKAGE_DIRECTORIES['easywork-plugin-models'], '../../packages/plugins/models');
  assert.ok(official.clients.some(client => client.id === 'ui-model-selection'), 'upstream reference is not pruned');
});
