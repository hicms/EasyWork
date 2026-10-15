import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelsAccount } from '../src/account.ts';
import { AskClient, AskError } from '../src/ask-client.ts';
import { mockService, model, token } from './fixture.ts';

const password = 'registration password';
const inviteCode = 'ASK-case-Sensitive-invitation';

test('registration sends the invitation to ask-service and restores a private session with models', async t => {
  const fixture = mockService();
  const account = new ModelsAccount(fixture.records, fixture.api); t.after(() => account.dispose());
  const state = await account.register(' test@example.com ', password, ` ${inviteCode}\n`);
  const request = fixture.calls[0];
  assert.equal(new URL(request.url).pathname, '/api/auth/register');
  assert.equal(request.method, 'POST'); assert.equal(request.headers.has('authorization'), false);
  assert.deepEqual(await request.json(), { email: 'test@example.com', password, inviteCode });
  assert.equal(state.user?.email, 'test@example.com'); assert.equal(state.models[0].id, model.id);
  for (const secret of [token, password, inviteCode]) assert.equal(JSON.stringify(state).includes(secret), false);
  assert.ok(JSON.stringify(fixture.records.value).includes(token));
  for (const secret of [password, inviteCode]) assert.equal(JSON.stringify(fixture.records.value).includes(secret), false);
  const restored = new ModelsAccount(fixture.records, fixture.api); t.after(() => restored.dispose());
  assert.equal((await restored.state()).models[0].id, model.id);
});

test('missing invitation or invalid registration credentials cannot reserve credentials or dispatch', async t => {
  const fixture = mockService(); const account = new ModelsAccount(fixture.records, fixture.api); t.after(() => account.dispose());
  for (const [email, secret, invitation] of [
    ['test@example.com', password, ''], ['test@example.com', password, ' \n '],
    ['', password, inviteCode], ['a'.repeat(255) + '@example.com', password, inviteCode],
    ['test@example.com', 'short', inviteCode], ['test@example.com', '😀'.repeat(7), inviteCode],
    ['test@example.com', '密'.repeat(342), inviteCode],
  ]) {
    await assert.rejects(account.register(email, secret, invitation), error => error instanceof AskError && error.status === 400);
  }
  assert.equal(fixture.calls.length, 0); assert.equal(fixture.records.value, undefined);
});

test('registration accepts eight Unicode characters and preserves a successful session when the catalog fails', async t => {
  const fixture = mockService(); fixture.setModelsStatus(503);
  const account = new ModelsAccount(fixture.records, fixture.api); t.after(() => account.dispose());
  const partial = await account.register('test@example.com', '😀'.repeat(8), inviteCode);
  assert.ok(partial.user); assert.ok(partial.error); assert.equal(partial.models.length, 0);
  assert.ok(JSON.stringify(fixture.records.value).includes(token));
  fixture.setModelsStatus(200); assert.equal((await account.state(true)).models[0].id, model.id);
  assert.equal(fixture.calls.filter(call => call.url.endsWith('/api/auth/register')).length, 1);
});

test('invalid invitation and duplicate email errors are actionable and never echo service bodies', async t => {
  for (const [status, message] of [[400, /邀请码/], [409, /邮箱.*已注册/], [503, /稍后重试/]] as const) {
    const fixture = mockService();
    const account = new ModelsAccount(fixture.records, new AskClient(async () => Response.json({ error: `${token} ${password} ${inviteCode}` }, { status })));
    t.after(() => account.dispose());
    await assert.rejects(account.register('test@example.com', password, inviteCode), error => {
      assert.ok(error instanceof AskError); assert.equal(error.status, status); assert.match(error.message, message);
      for (const secret of [token, password, inviteCode]) assert.equal(error.message.includes(secret), false);
      return true;
    });
    assert.equal(account.view().user, null); assert.equal(JSON.stringify(fixture.records.value).includes(token), false);
  }
});

test('logout in either Host wins against pending registration and revokes its late session', async t => {
  for (const external of [false, true]) {
    const fixture = mockService(); let release!: () => void; let began!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { began = resolve; });
    const account = new ModelsAccount(fixture.records, new AskClient(async (input, init) => {
      if (String(input).endsWith('/api/auth/register')) { began(); await gate; }
      return fixture.fetcher(input, init);
    }));
    const other = new ModelsAccount(fixture.records, fixture.api);
    t.after(() => { release(); account.dispose(); other.dispose(); });
    const pending = account.register('test@example.com', password, inviteCode); await started;
    await (external ? other : account).logout(); release(); await assert.rejects(pending, /取消|变更/);
    assert.equal(account.view().user, null); assert.equal(JSON.stringify(fixture.records.value).includes(token), false);
    assert.equal(fixture.calls.at(-1)?.url.endsWith('/api/auth/logout'), true);
  }
});

test('cancelling registration after the service creates a session revokes it without storing it', async t => {
  const fixture = mockService(); const abort = new AbortController();
  const account = new ModelsAccount(fixture.records, new AskClient(async (input, init) => {
    const response = await fixture.fetcher(input, init);
    if (String(input).endsWith('/api/auth/register')) abort.abort(new Error('cancelled'));
    return response;
  }));
  t.after(() => account.dispose());
  await assert.rejects(account.register('test@example.com', password, inviteCode, abort.signal), /取消/);
  assert.equal(JSON.stringify(fixture.records.value).includes(token), false);
  assert.equal(fixture.calls.at(-1)?.url.endsWith('/api/auth/logout'), true);
});

test('cancellation while waiting for or finishing credential commit cannot leave a registered session', async t => {
  for (const timing of ['before', 'after']) {
    const fixture = mockService(); const abort = new AbortController(); let writes = 0;
    const account = new ModelsAccount({
      read: fixture.records.read,
      change: async mutate => {
        const commit = ++writes === 2;
        if (commit && timing === 'before') abort.abort(new Error('cancelled before commit'));
        await fixture.records.change(mutate);
        if (commit && timing === 'after') abort.abort(new Error('cancelled after commit'));
      },
    }, fixture.api);
    t.after(() => account.dispose());
    await assert.rejects(account.register('test@example.com', password, inviteCode, abort.signal), /取消/);
    assert.equal(account.view().user, null);
    assert.equal(JSON.stringify(fixture.records.value).includes(token), false, timing);
    assert.equal(fixture.calls.at(-1)?.url.endsWith('/api/auth/logout'), true, timing);
  }
});

test('cancelling a committed registration cannot clear a newer login from another Host', async t => {
  const fixture = mockService(); const abort = new AbortController(); let writes = 0;
  const other = new ModelsAccount(fixture.records, fixture.api);
  const account = new ModelsAccount({
    read: fixture.records.read,
    change: async mutate => {
      const commit = ++writes === 2; await fixture.records.change(mutate);
      if (commit) {
        fixture.setToken('new.session.signature'); await other.login('test@example.com', 'other password');
        abort.abort(new Error('registration cancelled'));
      }
    },
  }, fixture.api);
  t.after(() => { account.dispose(); other.dispose(); });
  await assert.rejects(account.register('test@example.com', password, inviteCode, abort.signal), /取消/);
  assert.ok(JSON.stringify(fixture.records.value).includes('new.session.signature'));
  assert.equal(JSON.stringify(fixture.records.value).includes(token), false);
  assert.equal(fixture.calls.at(-1)?.headers.get('authorization'), 'Bearer ' + token);
  assert.equal((await other.state()).user?.id, 'user');
});
