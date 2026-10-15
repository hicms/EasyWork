import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Context } from '@deepseek-ai/cordis';
import { apply } from '../src/index.ts';
import { managementPath } from '../src/shared.ts';
import { memoryRecords, mockService, model, token } from './fixture.ts';

test('Host management uses scoped credentials, redacts responses and synchronizes external logout', async t => {
  const fixture = mockService(); const originalFetch = globalThis.fetch; globalThis.fetch = fixture.fetcher;
  const disposers: (() => void)[] = []; t.after(() => { disposers.reverse().forEach(dispose => dispose()); globalThis.fetch = originalFetch; });
  const records = memoryRecords(); const keys = new Set<string>(); let recordUpdated!: (key: string) => void;
  let route!: { path: string; methods: string[]; requestBody: string; fetch(request: Request): Promise<Response> };
  let adapter: any; let search: any; let fetch: any; let removedAdapter = false; let removedRoute = false; let removedSearch = false; let removedFetch = false; let updates = 0;
  let selection = { provider: 'old', model: 'old' };
  const registration = Object.assign(() => { removedAdapter = true; }, { replace() { updates++; } });
  const ctx = {
    credentials: {
      readRecord: async (key: string) => { keys.add(key); return records.read(); },
      modifyRecord: async (key: string, mutate: (value: unknown) => Promise<unknown>) => {
        keys.add(key); const next = await mutate(await records.read());
        if (next !== undefined) { await records.change(() => next); recordUpdated(key); }
      },
    },
    agentDefaultModel: { currentSelection: () => selection, saveSelection: async (value: typeof selection) => { selection = value; } },
    llm: { registerAdapter: (providers: string[], value: unknown) => { assert.deepEqual(providers, ['easywork']); adapter = value; return registration; } },
    web: {
      registerSearchProvider: (value: unknown) => { search = value; disposers.push(() => { removedSearch = true; }); },
      registerFetchProvider: (value: unknown) => { fetch = value; disposers.push(() => { removedFetch = true; }); },
    },
    connection: { fetch: { register: (value: typeof route) => { route = value; return () => { removedRoute = true; }; } } },
    on: (event: string, listener: typeof recordUpdated) => { assert.equal(event, 'credentials/record-updated'); recordUpdated = listener; },
    effect: (effect: () => () => void) => { disposers.push(effect()); },
  };
  apply(ctx as unknown as Context);
  assert.equal(search.id, 'easywork');
  assert.equal(fetch.id, 'easywork');
  await assert.rejects(fetch.fetch({ url: 'https://example.com/' }), (error: any) => error.code === 'WEB_AUTH_REQUIRED');
  await assert.rejects(search.search({ query: 'example' }), (error: any) => error.code === 'WEB_AUTH_REQUIRED');
  assert.equal(route.path, managementPath); assert.deepEqual(route.methods, ['POST']); assert.equal(route.requestBody, 'buffered');
  async function invoke(body: unknown) {
    const response = await route.fetch(new Request('https://easywork.test' + managementPath, { method: 'POST', body: JSON.stringify(body) }));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json(); assert.equal(JSON.stringify(payload).includes(token), false);
    return { status: response.status, ...payload };
  }
  assert.equal((await invoke({ endpoint: 'state' })).value.user, null);
  const login = await invoke({ endpoint: 'login', payload: { email: 'test@example.com', password: 'test password' } });
  assert.equal(login.status, 200); assert.equal(login.value.models[0].id, model.id);
  assert.equal(selection.provider, 'easywork'); assert.equal(selection.model, model.id);
  assert.equal(keys.size, 1); assert.ok([...keys][0].includes('easywork-plugin-models'));
  assert.ok(JSON.stringify(records.value).includes(token)); assert.equal(JSON.stringify(records.value).includes('test password'), false);
  assert.equal((await invoke({ endpoint: 'unknown' })).status, 400);
  const prepared = await adapter.prepareCall('easywork', model.id);
  await records.change(() => ({ kind: 'grant', payload: { origin: 'https://ask.vigoai.cn', signedOut: true, operation: 'external-logout' } }));
  recordUpdated([...keys][0]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await adapter.listModels(), []); assert.ok(updates > 0);
  await assert.rejects(async () => { for await (const _chunk of prepared.stream({ provider: 'easywork', model: model.id, messages: [] })) {} }, /变更|登录/);
  assert.equal((await invoke({ endpoint: 'state' })).value.user, null);
  disposers.reverse().forEach(dispose => dispose()); disposers.length = 0;
  assert.equal(removedAdapter, true); assert.equal(removedRoute, true); assert.equal(removedSearch, true); assert.equal(removedFetch, true);
});
