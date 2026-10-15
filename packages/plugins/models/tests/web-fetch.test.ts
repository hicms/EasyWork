import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelsAccount } from '../src/account.ts';
import { AskClient } from '../src/ask-client.ts';
import { createFetchProvider } from '../src/web-fetch.ts';
import { serviceOrigin } from '../src/shared.ts';
import { memoryRecords, token } from './fixture.ts';

const grant = () => ({ origin: serviceOrigin, token, expiresAt: Date.now() + 60_000, user: { id: 'test', email: 'test@example.com' } });
const page = { url: 'https://example.com/page', content: 'Exa page text', truncated: false };
const code = (expected: string) => (error: any) => error.code === expected;

test('fetch restores the account and requests server Exa extraction with no client-side upstream key or direct URL access', async t => {
  let calls = 0;
  const account = new ModelsAccount(memoryRecords(grant()), new AskClient(async (input, init) => {
    calls++; assert.equal(String(input), serviceOrigin + '/api/fetch');
    assert.equal(new Headers(init!.headers).get('authorization'), 'Bearer ' + token);
    assert.equal(new Headers(init!.headers).get('x-api-key'), null);
    assert.deepEqual(JSON.parse(init!.body as string), { url: page.url });
    return Response.json({ ...page, secret: 'discarded' });
  }));
  t.after(() => account.dispose());
  const result = await createFetchProvider(account).fetch({ url: '  ' + page.url + '  ' });
  assert.equal(result.url, page.url); assert.equal(result.statusCode, 200); assert.equal(result.body.kind, 'text');
  assert.match(result.body.content, /Exa extracted content; source HTTP status unknown/);
  assert.ok(result.body.content.endsWith(page.content)); assert.equal(result.truncated, false);
  assert.equal(JSON.stringify(result).includes('discarded'), false); assert.equal(calls, 1);
});

test('invalid URL, missing login and pre-cancelled fetch never dispatch', async t => {
  let calls = 0;
  const account = new ModelsAccount(memoryRecords(), new AskClient(async () => { calls++; throw new Error('unexpected'); }));
  t.after(() => account.dispose()); const provider = createFetchProvider(account);
  for (const url of ['', 'invalid', 'file:///secret', 'https://user:secret@example.com', 'https://example.com/' + 'x'.repeat(8192)]) {
    await assert.rejects(provider.fetch({ url }), code('WEB_FETCH_INVALID_URL'));
  }
  await assert.rejects(provider.fetch({ url: page.url }), code('WEB_AUTH_REQUIRED'));
  await assert.rejects(provider.fetch({ url: page.url }, AbortSignal.abort()), code('WEB_ABORTED'));
  assert.equal(calls, 0);
});

test('fetch rejects malformed responses and keeps truncation reported by the service', async t => {
  let payload: unknown;
  const account = new ModelsAccount(memoryRecords(grant()), new AskClient(async () => Response.json(payload)));
  t.after(() => account.dispose()); const provider = createFetchProvider(account);
  for (payload of [null, {}, { ...page, content: '' }, { ...page, content: null }, { ...page, truncated: 'true' }, { ...page, url: 'file:///secret' }]) {
    await assert.rejects(provider.fetch({ url: page.url }), code('WEB_PROVIDER_RESPONSE_INVALID'));
  }
  payload = { ...page, truncated: true };
  assert.equal((await provider.fetch({ url: page.url })).truncated, true);
});

test('upstream or unavailable endpoint errors retain login and redact bodies; only service 401 revokes it', async t => {
  const records = memoryRecords(grant()); let status = 502;
  const account = new ModelsAccount(records, new AskClient(async () => Response.json({ error: token }, { status })));
  t.after(() => account.dispose()); const provider = createFetchProvider(account);
  for (status of [400, 404, 503, 502, 429]) {
    const expected = status === 400 ? 'WEB_FETCH_INVALID_URL' : [404, 503].includes(status) ? 'WEB_PROVIDER_UNAVAILABLE' : 'WEB_PROVIDER_ERROR';
    await assert.rejects(provider.fetch({ url: page.url }), (error: any) => code(expected)(error) && !error.message.includes(token));
    assert.ok(JSON.stringify(records.value).includes(token));
  }
  status = 401; await assert.rejects(provider.fetch({ url: page.url }), code('WEB_AUTH_REQUIRED'));
  assert.equal(JSON.stringify(records.value).includes(token), false);
});

test('fetch cannot return late content after caller cancellation, account changes or disposal', async () => {
  for (const reason of ['caller', 'logout', 'external-logout', 'dispose']) {
    const records = memoryRecords(grant()); let finish!: () => void; let began!: () => void; let requestSignal!: AbortSignal;
    const started = new Promise<void>(resolve => { began = resolve; });
    const account = new ModelsAccount(records, new AskClient(async (input, init) => {
      if (String(input).endsWith('/api/auth/logout')) return new Response(null, { status: 204 });
      requestSignal = init!.signal!; began(); await new Promise<void>(resolve => { finish = resolve; }); return Response.json(page);
    }));
    try {
      const controller = new AbortController(); const pending = createFetchProvider(account).fetch({ url: page.url }, controller.signal);
      await started;
      if (reason === 'caller') controller.abort();
      else if (reason === 'logout') await account.logout();
      else if (reason === 'external-logout') await records.change(() => ({ origin: serviceOrigin, signedOut: true }));
      else account.dispose();
      if (reason !== 'external-logout') assert.equal(requestSignal.aborted, true);
      finish(); await assert.rejects(pending, code(reason === 'caller' ? 'WEB_ABORTED' : reason === 'dispose' ? 'WEB_PROVIDER_ERROR' : 'WEB_AUTH_REQUIRED'));
    } finally { account.dispose(); }
  }
});

test('a late fetch 401 cannot revoke a newer login', async t => {
  const records = memoryRecords(grant()); let finish!: () => void; let began!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const account = new ModelsAccount(records, new AskClient(async () => {
    began(); await new Promise<void>(resolve => { finish = resolve; }); return new Response(null, { status: 401 });
  }));
  t.after(() => account.dispose()); const pending = createFetchProvider(account).fetch({ url: page.url });
  await started; await records.change(() => ({ ...grant(), token: 'new.session.signature' })); finish();
  await assert.rejects(pending, code('WEB_AUTH_REQUIRED'));
  assert.ok(JSON.stringify(records.value).includes('new.session.signature'));
});
