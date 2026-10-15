import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelsAccount } from '../src/account.ts';
import { AskClient } from '../src/ask-client.ts';
import { loggedIn, memoryRecords, mockService, model, token } from './fixture.ts';

test('login and restoration expose only public state; logout revokes the service session and aborts prepared work', async t => {
  const fixture = mockService(); const changes: string[][] = [];
  const account = new ModelsAccount(fixture.records, fixture.api, async models => { changes.push(models.map(row => row.id)); });
  t.after(() => account.dispose());
  const state = await account.login('test@example.com', 'test password');
  assert.equal(state.user?.email, 'test@example.com'); assert.equal(state.models.length, 1);
  assert.equal(JSON.stringify(state).includes(token), false); assert.equal(JSON.stringify(fixture.records.value).includes('test password'), false);
  assert.equal(fixture.calls.find(call => call.url.endsWith('/api/models'))?.headers.get('authorization'), 'Bearer ' + token);
  assert.deepEqual(changes, [[model.id]]);
  const restored = new ModelsAccount(fixture.records, fixture.api); t.after(() => restored.dispose());
  assert.equal((await restored.state()).models[0].id, model.id);
  const binding = await account.capture(model.id); await account.logout();
  assert.equal(binding.signal.aborted, true); assert.equal(account.view().user, null);
  assert.equal(JSON.stringify(fixture.records.value).includes(token), false);
  assert.equal(fixture.calls.at(-1)?.url.endsWith('/api/auth/logout'), true);
  await assert.rejects(() => account.capture(model.id), /登录/);
});

test('catalog/network failure preserves a successful login and permits retry; 401 clears only its own token', async t => {
  const fixture = mockService(); fixture.setModelsStatus(502);
  const account = new ModelsAccount(fixture.records, fixture.api); t.after(() => account.dispose());
  const partial = await account.login('test@example.com', 'test password');
  assert.ok(partial.user); assert.ok(partial.error); assert.equal(partial.models.length, 0);
  fixture.setModelsStatus(200); assert.equal((await account.state(true)).models.length, 1);
  fixture.setMeStatus(503); const unavailable = await account.state(true);
  assert.ok(unavailable.user); assert.equal(unavailable.models.length, 1); assert.ok(JSON.stringify(fixture.records.value).includes(token));
  fixture.setMeStatus(401); const expired = await account.state(true);
  assert.equal(expired.user, null); assert.equal(expired.models.length, 0); assert.ok(expired.error);
  assert.equal(JSON.stringify(fixture.records.value).includes(token), false);
});

test('a late 401 for a previous login cannot revoke the current account grant', async t => {
  const fixture = await loggedIn(); t.after(() => fixture.account.dispose());
  const old = await fixture.account.capture(model.id);
  fixture.setToken('new.session.signature'); await fixture.account.login('test@example.com', 'test password');
  assert.equal(old.signal.aborted, true);
  await fixture.account.expire(token);
  assert.equal(fixture.account.view().user?.id, 'user');
  assert.ok(JSON.stringify(fixture.records.value).includes('new.session.signature'));
});

test('logout wins against an outstanding login; its late JWT is never persisted', async t => {
  let complete!: () => void; const gate = new Promise<void>(resolve => { complete = resolve; });
  const records = memoryRecords();
  const account = new ModelsAccount(records, new AskClient(async input => {
    if (String(input).endsWith('/api/auth/login')) { await gate; return Response.json({ token, expiresAt: Date.now() + 60_000, user: { id: 'user', email: 'test@example.com' } }); }
    return new Response(null, { status: 204 });
  }));
  t.after(() => account.dispose());
  const pending = account.login('test@example.com', 'test password');
  await account.logout(); complete(); await assert.rejects(pending, /取消/);
  assert.equal(account.view().user, null); assert.equal(JSON.stringify(records.value).includes(token), false);
});

test('a thirty-day login is not expired by the JavaScript timer maximum', async t => {
  const fixture = await loggedIn(); t.after(() => fixture.account.dispose());
  const expiry = fixture.account.view().expiresAt!;
  assert.ok(expiry - Date.now() > 2_147_483_647);
  assert.equal((await fixture.account.state()).user?.id, 'user');
});

test('API failures do not echo response bodies, JWTs or credentials', async () => {
  const api = new AskClient(async () => Response.json({ token, password: 'secret', error: token }, { status: 500 }));
  await assert.rejects(api.request('/api/models'), error => error instanceof Error && !error.message.includes(token) && !error.message.includes('secret'));
});

test('a logout in another Host wins over a pending login using the same credential record', async t => {
  let complete!: () => void; const gate = new Promise<void>(resolve => { complete = resolve; });
  let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  const fixture = mockService();
  const first = new ModelsAccount(fixture.records, new AskClient(async (input, init) => {
    if (String(input).endsWith('/api/auth/login')) { began(); await gate; }
    return fixture.fetcher(input, init);
  }));
  const second = new ModelsAccount(fixture.records, fixture.api); t.after(() => { first.dispose(); second.dispose(); });
  const login = first.login('test@example.com', 'test password'); await started;
  await second.logout(); complete(); await assert.rejects(login, /取消|变更/);
  assert.equal(JSON.stringify(fixture.records.value).includes(token), false);
});

test('a state read observing a committed grant cannot turn successful login into an error', async t => {
  const fixture = mockService(); let account!: ModelsAccount; let reenter = true;
  const records = {
    read: fixture.records.read,
    change: async (mutate: (value: unknown) => unknown) => {
      await fixture.records.change(mutate);
      if (reenter && JSON.stringify(fixture.records.value).includes(token)) { reenter = false; await account.state(); }
    },
  };
  account = new ModelsAccount(records, fixture.api); t.after(() => account.dispose());
  assert.equal((await account.login('test@example.com', 'test password')).user?.id, 'user');
});

test('cancelling model preparation stops waiting without cancelling another caller’s catalog load', async t => {
  const fixture = mockService(); let release!: () => void;
  let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const account = new ModelsAccount(fixture.records, new AskClient(async (input, init) => {
    if (String(input).endsWith('/api/models')) { began(); await gate; }
    return fixture.fetcher(input, init);
  }));
  t.after(() => { release(); account.dispose(); });
  const login = account.login('test@example.com', 'test password'); await started;
  const abort = new AbortController(); const preparation = account.capture(model.id, abort.signal);
  abort.abort(new Error('preparation cancelled'));
  await assert.rejects(preparation, /preparation cancelled/);
  release(); assert.equal((await login).models[0].id, model.id);
  assert.equal((await account.capture(model.id)).model.id, model.id);
});
