import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import test from 'node:test';
import { build } from 'esbuild';
import { isWorkspaceRoot, sessionCreationMessage } from '../../../packages/bundle/src/client/harness/workspace-directory.ts';

const bundleRequire = createRequire(new URL('../../../packages/bundle/package.json', import.meta.url));
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../../../packages/bundle/src/client/harness/fresh-session.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react/jsx-runtime'],
});

function mount(t, { path = 'E:\\Work', create, language = 'zh-CN' } = {}) {
  const owned = { exports: {} };
  const errors = [];
  runInNewContext(compiled.outputFiles[0].text, {
    module: owned, exports: owned.exports, require: bundleRequire, Error,
    document: { documentElement: { lang: language } }, console: { error: (...args) => errors.push(args) },
  });
  const sessionCalls = [], workspaceCalls = [], opened = [], fallback = [], disposers = [];
  const workspace = { workspaceId: 'workspace-1', path, sessionIds: ['existing'] };
  const rows = [workspace];
  let navigation, registration;
  const sessions = {
    list: { getSnapshot: () => ({ byId: { existing: { id: 'existing', retainedBy: { mainView: 1 } } } }) },
    create: async input => { sessionCalls.push(input); return create ? create(input) : 'new-session'; },
  };
  const workspaces = {
    list: { getSnapshot: () => ({ items: rows }) },
    create: async input => { workspaceCalls.push(input); return { ...workspace, path: input.path }; },
  };
  const owner = { startSession: input => fallback.push(input), openSession: id => opened.push(id) };
  const originals = { start: owner.startSession, session: sessions.create, workspace: workspaces.create };
  const ctx = {
    uiWorkspace: owner, sessions, workspaces,
    layout: { beginNavigation: () => { navigation?.abort(); navigation = new AbortController(); return navigation.signal; } },
    inject: (_names, apply) => apply(ctx),
    effect: factory => { const dispose = factory(); disposers.push(dispose); return dispose; },
    slots: {
      inject: (_name, apply) => apply(),
      register: options => { registration = options; return () => {}; },
    },
  };
  owned.exports.installFreshSessionNavigation(ctx);
  const notice = registration.inject();
  const dispose = () => disposers.splice(0).reverse().forEach(callback => callback());
  t.after(dispose);
  return { owner, sessions, workspaces, workspace, rows, originals, sessionCalls, workspaceCalls, opened, fallback,
    errors, notice, dispose, navigate: () => ctx.layout.beginNavigation() };
}

test('root policy covers Windows drives, UNC shares and normalized parent paths', () => {
  for (const path of ['E:\\', 'e:/', 'E:', 'E:\\folder\\..', 'E:\\.\\', '\\\\?\\E:\\',
    '\\\\server\\share', '\\\\server\\share\\folder\\..', '\\\\?\\UNC\\server\\share\\', '/', '/tmp/..']) {
    assert.equal(isWorkspaceRoot(path), true, path);
  }
  for (const path of ['E:\\Work', 'E:/Work/../Other', '\\\\server\\share\\Work', '\\\\?\\E:\\Work',
    '\\\\?\\UNC\\server\\share\\Work', '/home/person', '/home/person/..', 'relative']) {
    assert.equal(isWorkspaceRoot(path), false, path);
  }
});

test('root selection is refused before workspace registration and can be retried with a subfolder', async t => {
  const app = mount(t);
  await assert.rejects(app.workspaces.create({ path: 'E:\\' }), /子文件夹/);
  assert.equal(app.workspaceCalls.length, 0);
  const workspace = await app.workspaces.create({ path: 'E:\\Work' });
  assert.equal(workspace.path, 'E:\\Work');
  assert.equal(app.workspaceCalls.length, 1);
});

test('a persisted root workspace produces visible guidance without creating or moving a session', async t => {
  const app = mount(t, { path: 'E:\\' });
  let notifications = 0;
  const unsubscribe = app.notice.source.subscribe(() => notifications++);
  app.owner.startSession();
  await setImmediate();
  assert.equal(app.sessionCalls.length, 0);
  assert.equal(app.opened.length, 0);
  assert.equal(app.workspaceCalls.length, 0);
  assert.equal(app.workspace.path, 'E:\\');
  assert.match(app.notice.source.getSnapshot(), /侧栏.*已有会话和文件会保留/);
  assert.ok(notifications > 0);
  unsubscribe();
  app.notice.dismiss();
  assert.equal(app.notice.source.getSnapshot(), null);
});

test('other client session callers cannot bypass the root guard with cwd or workspaceId', async t => {
  const app = mount(t, { path: 'E:\\' });
  await assert.rejects(app.sessions.create({ cwd: 'E:\\' }), /根目录/);
  await assert.rejects(app.sessions.create({ workspaceId: 'workspace-1', cwd: 'E:\\Safe' }), /根目录/);
  await assert.rejects(app.sessions.create({ workspaceId: 'workspace-1', sessionId: 'preallocated' }), /根目录/);
  assert.equal(app.sessionCalls.length, 0);
  await app.sessions.create({ workspaceId: 'workspace-1', sessionId: 'existing' });
  assert.equal(app.sessionCalls[0].sessionId, 'existing');
});

test('ordinary new sessions keep the selected workspace and allocate a fresh identity', async t => {
  const app = mount(t);
  app.owner.startSession('workspace-1');
  await setImmediate();
  assert.equal(app.sessionCalls.length, 1);
  assert.equal(app.sessionCalls[0].workspaceId, 'workspace-1');
  assert.equal(app.sessionCalls[0].sessionId, undefined);
  assert.deepEqual(app.opened, ['new-session']);
  assert.equal(app.notice.source.getSnapshot(), null);
});

test('directory failures preserve the original error and show recovery guidance', async t => {
  for (const code of ['EPERM', 'EACCES', 'ENOENT', 'ENOTDIR', 'EROFS', 'ENOSPC']) {
    const failure = new Error(`session create failed: remote/internal: failed to ensure project directory: ${code}`);
    const app = mount(t, { create: () => { throw failure; } });
    app.owner.startSession();
    await setImmediate();
    assert.match(app.notice.source.getSnapshot(), /检查磁盘.*已有会话和文件会保留/);
    assert.ok(app.notice.source.getSnapshot().includes(code));
    assert.equal(app.errors[0][1], failure);
    assert.deepEqual(app.opened, []);
    assert.equal(app.workspaceCalls.length, 0);
    await assert.rejects(app.sessions.create({ workspaceId: 'workspace-1' }), error => error === failure);
  }
});

test('unrelated failures are not labeled as directory failures', () => {
  const failure = new Error('session/writer-held: already running');
  assert.equal(sessionCreationMessage(failure, 'E:\\Work', false), failure.message);
  assert.match(sessionCreationMessage(new Error('EACCES'), 'E:\\Work', true), /folder.*unavailable/);
});

test('English root guidance and fallback navigation remain available', async t => {
  const app = mount(t, { path: 'E:\\', language: 'en-US' });
  app.owner.startSession();
  await setImmediate();
  assert.match(app.notice.source.getSnapshot(), /writable subfolder/);
  app.rows.length = 0;
  app.owner.startSession();
  assert.equal(app.fallback.length, 1);
  assert.equal(app.notice.source.getSnapshot(), null);
});

test('superseded navigation and disposal suppress late errors and opens', async t => {
  for (const finish of ['resolve', 'reject']) {
    for (const cancel of ['navigate', 'dispose']) {
      const pending = Promise.withResolvers();
      const app = mount(t, { create: () => pending.promise });
      app.owner.startSession();
      app[cancel]();
      if (finish === 'resolve') pending.resolve('late-session');
      else pending.reject(new Error('EACCES'));
      await setImmediate();
      assert.deepEqual(app.opened, []);
      assert.equal(app.notice.source.getSnapshot(), null);
      assert.deepEqual(app.errors, []);
    }
  }
});

test('disposal restores decorated methods without overwriting later owners', t => {
  const app = mount(t);
  app.dispose();
  assert.equal(app.owner.startSession, app.originals.start);
  assert.equal(app.sessions.create, app.originals.session);
  assert.equal(app.workspaces.create, app.originals.workspace);
  const other = mount(t);
  const replacement = () => {};
  other.owner.startSession = replacement;
  other.sessions.create = replacement;
  other.workspaces.create = replacement;
  other.dispose();
  assert.equal(other.owner.startSession, replacement);
  assert.equal(other.sessions.create, replacement);
  assert.equal(other.workspaces.create, replacement);
});
