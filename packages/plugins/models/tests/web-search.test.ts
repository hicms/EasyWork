import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelsAccount } from '../src/account.ts';
import { AskClient } from '../src/ask-client.ts';
import { createSearchProvider } from '../src/web-search.ts';
import { memoryRecords, mockService, token } from './fixture.ts';
import { serviceOrigin } from '../src/shared.ts';

const grant = () => ({ origin: serviceOrigin, token, expiresAt: Date.now() + 60_000, user: { id: 'user', email: 'test@example.com' } });
const result = { title: 'Example', url: 'https://example.com/page', snippet: 'Public page' };
const code = (value: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === value;

test('search restores the EasyWork grant without a model or Sync Center and sends only query/count to the service', async t => {
  const records = memoryRecords(grant()); const calls: Request[] = [];
  const account = new ModelsAccount(records, new AskClient(async (input, init) => {
    calls.push(new Request(input, init)); return Response.json({ results: [result, { ...result, url: 'https://example.com/second' }] });
  }));
  t.after(() => account.dispose());
  const provider = createSearchProvider(account);
  assert.equal(provider.id, 'easywork'); assert.equal(provider.available(), true);
  const response = await provider.search({ query: '  example  ', maxResults: 1 });
  assert.deepEqual(response, { sources: [result], truncated: true });
  assert.equal(calls.length, 1); assert.equal(calls[0].url, serviceOrigin + '/api/search');
  assert.equal(calls[0].method, 'POST'); assert.equal(calls[0].headers.get('authorization'), 'Bearer ' + token);
  assert.equal(calls[0].redirect, 'error'); assert.deepEqual(await calls[0].json(), { query: 'example', maxResults: 1 });
  assert.equal(JSON.stringify(response).includes(token), false);
  assert.equal(JSON.stringify(account.view()).includes(token), false);
});

test('empty results are valid; invalid requests and missing login fail before dispatch', async t => {
  let calls = 0;
  const records = memoryRecords();
  const account = new ModelsAccount(records, new AskClient(async () => { calls++; return Response.json({ results: [] }); }));
  t.after(() => account.dispose()); const provider = createSearchProvider(account);
  await assert.rejects(provider.search({ query: 'example' }), code('WEB_AUTH_REQUIRED'));
  await records.change(() => grant());
  for (const request of [{ query: ' ' }, { query: 'x'.repeat(2001) }, { query: 'q', maxResults: 0 }, { query: 'q', maxResults: 1.5 }]) {
    await assert.rejects(provider.search(request), code('WEB_SEARCH_INVALID_REQUEST'));
  }
  assert.equal(calls, 0);
  assert.deepEqual(await provider.search({ query: 'example' }), { sources: [], truncated: false });
  assert.equal(calls, 1);
});

test('search bounds count and rejects malformed responses and unsafe citation URLs', async t => {
  let payload: unknown = { results: [result] }; let body: any;
  const account = new ModelsAccount(memoryRecords(grant()), new AskClient(async (_input, init) => {
    body = JSON.parse(String(init?.body)); return Response.json(payload);
  }));
  t.after(() => account.dispose()); const provider = createSearchProvider(account);
  await provider.search({ query: 'q', maxResults: 500 }); assert.equal(body.maxResults, 100);
  for (payload of [{}, { results: null }, { results: [null] }, { results: [{ url: result.url }] },
    { results: [{ ...result, url: 'javascript:alert(1)' }] }, { results: [{ ...result, url: 'https://name:secret@example.com/' }] }]) {
    await assert.rejects(provider.search({ query: 'q' }), code('WEB_PROVIDER_RESPONSE_INVALID'));
  }
});

test('service 401 expires only the captured grant; 503/502/transport failures keep login and never echo secrets', async t => {
  const records = memoryRecords(grant()); let status = 503; let transport = false;
  const account = new ModelsAccount(records, new AskClient(async () => {
    if (transport) throw new Error(token);
    return Response.json({ error: token }, { status });
  }));
  t.after(() => account.dispose()); const provider = createSearchProvider(account);
  for (status of [503, 502, 429]) {
    await assert.rejects(provider.search({ query: 'q' }), error => code(status === 503 ? 'WEB_PROVIDER_UNAVAILABLE' : 'WEB_PROVIDER_ERROR')(error) && !(error as Error).message.includes(token));
    assert.ok(JSON.stringify(records.value).includes(token));
  }
  transport = true; await assert.rejects(provider.search({ query: 'q' }), code('WEB_PROVIDER_ERROR'));
  transport = false; status = 401;
  await assert.rejects(provider.search({ query: 'q' }), code('WEB_AUTH_REQUIRED'));
  assert.equal(JSON.stringify(records.value).includes(token), false); assert.equal(account.view().user, null);
});

test('caller cancellation and logout abort search; a transport ignoring abort cannot return a late result', async t => {
  const fixture = mockService(); let finish!: () => void; let began!: () => void; let requestSignal!: AbortSignal;
  let started = Promise.resolve();
  const account = new ModelsAccount(fixture.records, new AskClient(async (input, init) => {
    if (!String(input).endsWith('/api/search')) return fixture.fetcher(input, init);
    requestSignal = init!.signal!; began(); await new Promise<void>(resolve => { finish = resolve; });
    return Response.json({ results: [result] });
  }));
  t.after(() => account.dispose()); const provider = createSearchProvider(account);
  for (const reason of ['caller', 'logout']) {
    await account.login('test@example.com', 'test password');
    started = new Promise<void>(resolve => { began = resolve; });
    const controller = new AbortController(); const pending = provider.search({ query: 'q' }, controller.signal);
    await started;
    if (reason === 'caller') controller.abort(); else await account.logout();
    assert.equal(requestSignal.aborted, true); finish();
    await assert.rejects(pending, code(reason === 'caller' ? 'WEB_ABORTED' : 'WEB_AUTH_REQUIRED'));
  }
});

test('a stale search 401 cannot log out a newer login in another Host', async t => {
  const records = memoryRecords(grant()); let finish!: () => void; let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const account = new ModelsAccount(records, new AskClient(async () => {
    began(); await new Promise<void>(resolve => { finish = resolve; }); return new Response(null, { status: 401 });
  }));
  t.after(() => account.dispose()); const pending = createSearchProvider(account).search({ query: 'q' });
  await started; await records.change(() => ({ ...grant(), token: 'new.session.signature' })); finish();
  await assert.rejects(pending, code('WEB_AUTH_REQUIRED'));
  assert.ok(JSON.stringify(records.value).includes('new.session.signature'));
});

test('external logout is rechecked before returning results, and disposed accounts never dispatch', async t => {
  const records = memoryRecords(grant()); let calls = 0;
  const account = new ModelsAccount(records, new AskClient(async () => {
    calls++; await records.change(() => ({ origin: serviceOrigin, signedOut: true })); return Response.json({ results: [result] });
  }));
  t.after(() => account.dispose()); const provider = createSearchProvider(account);
  await assert.rejects(provider.search({ query: 'q' }), code('WEB_AUTH_REQUIRED'));
  account.dispose(); await records.change(() => grant());
  await assert.rejects(provider.search({ query: 'q' }), code('WEB_PROVIDER_ERROR')); assert.equal(calls, 1);
});
