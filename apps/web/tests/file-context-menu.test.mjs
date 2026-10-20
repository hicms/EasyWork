import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const bundleRequire = createRequire(new URL('../../../packages/bundle/package.json', import.meta.url));
const source = relative => fileURLToPath(new URL(`../../../packages/bundle/src/client/file-menu/${relative}`, import.meta.url));

async function load(entry) {
  const compiled = await build({ entryPoints: [source(entry)], bundle: true, write: false, platform: 'neutral', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
}

const forms = await load('path-forms.ts');
const model = await load('menu-model.ts');
const actions = await load('actions.ts');

const sidebarRight = bundleRequire.resolve('@deepseek-ai/dsh-client-ui-sidebar-right');
const sessionController = bundleRequire.resolve('@deepseek-ai/dsh-api-session-controller');
const { sessionFileAddress: officialAddress } = createRequire(sidebarRight)('@deepseek-ai/dsh-util-workspace-path');
const { formatFileMention } = await import(pathToFileURL(createRequire(sessionController).resolve('@deepseek-ai/dsh-file-reference/grammar')).href);

test('Host paths use one separator style per platform', () => {
  assert.equal(forms.toHostPath('E:\\proj/src/a.ts'), 'E:\\proj\\src\\a.ts');
  assert.equal(forms.toHostPath('e:/proj//a b/中文.md'), 'e:\\proj\\a b\\中文.md');
  assert.equal(forms.toHostPath('\\\\server\\share/dir/a.txt'), '\\\\server\\share\\dir\\a.txt');
  assert.equal(forms.toHostPath('/home/me/a b.txt'), '/home/me/a b.txt');
});

test('relative paths resolve against the workspace root and absolute ones are kept', () => {
  assert.equal(forms.resolveInWorkspace('E:\\proj', 'src/a.ts'), 'E:\\proj\\src\\a.ts');
  assert.equal(forms.resolveInWorkspace('E:\\proj\\', './src/a.ts'), 'E:\\proj\\src\\a.ts');
  assert.equal(forms.resolveInWorkspace('/work', 'src'), '/work/src');
  assert.equal(forms.resolveInWorkspace('/work', '/etc/hosts'), '/etc/hosts');
  assert.equal(forms.resolveInWorkspace('E:\\proj', 'D:/other/x.txt'), 'D:\\other\\x.txt');
  assert.equal(forms.resolveInWorkspace(undefined, 'src/a.ts'), undefined);
  assert.equal(forms.resolveInWorkspace('', 'src/a.ts'), undefined);
  assert.equal(forms.resolveInWorkspace('/work', '.'), '/work');
});

test('relative form exists only inside the workspace, with Windows case folding', () => {
  assert.equal(forms.relativeToWorkspace('E:\\proj', 'E:\\proj\\src\\a.ts'), 'src/a.ts');
  assert.equal(forms.relativeToWorkspace('e:\\PROJ', 'E:\\proj\\src\\a.ts'), 'src/a.ts');
  assert.equal(forms.relativeToWorkspace('E:\\proj', 'E:\\proj'), '.');
  assert.equal(forms.relativeToWorkspace('E:\\proj', 'E:\\project\\a.ts'), undefined);
  assert.equal(forms.relativeToWorkspace('E:\\proj', 'D:\\proj\\a.ts'), undefined);
  assert.equal(forms.relativeToWorkspace('/work', '/Work/a.ts'), undefined);
  assert.equal(forms.relativeToWorkspace(undefined, '/work/a.ts'), undefined);
});

test('prompt mentions follow the composer grammar', () => {
  assert.equal(forms.promptMention('E:\\proj', 'E:\\proj\\src\\a.ts', 'file'), '@src/a.ts');
  assert.equal(forms.promptMention('E:\\proj', 'E:\\proj\\src', 'directory'), '@src/');
  assert.equal(forms.promptMention('E:\\proj', 'E:\\proj\\my docs\\读我.md', 'file'), '@"my docs/读我.md"');
  assert.equal(forms.promptMention('E:\\proj', 'E:\\proj\\my docs', 'directory'), '@"my docs/"');
  assert.equal(forms.promptMention('E:\\proj', 'D:\\x\\a.ts', 'file'), '@D:/x/a.ts');
  assert.equal(forms.promptMention('/work', '/work/a"b.txt', 'file'), undefined);
  assert.equal(forms.promptMention('/work', '/work/a\u0007.txt', 'file'), undefined);
});

test('prompt mentions agree with the official grammar', () => {
  for (const [path, kind] of [['src/a.ts', 'file'], ['src', 'directory'], ['my docs/读我.md', 'file'], ['/abs/x.txt', 'file'], ['a"b.txt', 'file'], ['a\u0001b', 'file']]) {
    const official = formatFileMention({ kind, path }, false);
    const mine = forms.promptMention('/work', path.startsWith('/') ? path : `/work/${path}`, kind);
    if (official === undefined) assert.equal(mine, undefined, path);
    else if (kind === 'directory' && official.startsWith('@"')) assert.equal(mine, `${official}"`, path);
    else assert.equal(mine, official, path);
  }
});

test('resource addresses agree with the official file address grammar', () => {
  for (const [session, path] of [['s1', 'src/a.ts'], ['s-1', 'a b/中文 #1?.md'], ['s1', 'C:\\x\\y.txt'], ['s/1', './a.txt'], ['s1', '/etc/hosts']]) {
    assert.equal(forms.sessionFileAddress(session, path), officialAddress(session, path), `${session} ${path}`);
  }
});

test('reference labels recover the path and its directory mark', () => {
  assert.deepEqual(forms.parseReferencePath('@src/a.ts'), { path: 'src/a.ts', directory: false });
  assert.deepEqual(forms.parseReferencePath('@"my docs/"'), { path: 'my docs/', directory: true });
  assert.deepEqual(forms.parseReferencePath('@"my docs/a b.md"'), { path: 'my docs/a b.md', directory: false });
  assert.deepEqual(forms.parseReferencePath('E:\\proj\\a.ts'), { path: 'E:\\proj\\a.ts', directory: false });
  assert.equal(forms.parseReferencePath('@'), undefined);
  assert.equal(forms.parseReferencePath(''), undefined);
});

const target = (kind, extra = {}) => ({ kind, path: kind === 'directory' ? 'E:\\proj\\src' : 'E:\\proj\\src\\a.ts', sessionId: 's1', cwd: 'E:\\proj', ...extra });
const ids = entries => entries.map(entry => entry.id);

test('file and directory menus differ and desktop actions need the Host desktop', () => {
  const apps = [{ id: 'code', name: 'Code' }, { id: 'notepad', name: 'Notepad' }];
  assert.deepEqual(ids(model.buildFileMenu(target('file'), { desktop: true, applications: apps }, false)),
    ['preview', 'open', 'open-with', 'reveal', 'separator-1', 'copy-path', 'copy-relative-path', 'separator-2', 'insert-reference']);
  assert.deepEqual(model.buildFileMenu(target('file'), { desktop: true, applications: apps }, false)[2].submenu.map(item => item.id),
    ['open-with:code', 'open-with:notepad']);
  assert.deepEqual(ids(model.buildFileMenu(target('directory'), { desktop: true, applications: [] }, false)),
    ['open', 'separator-1', 'copy-path', 'copy-relative-path', 'separator-2', 'insert-reference']);
  assert.deepEqual(ids(model.buildFileMenu(target('file'), { desktop: false, applications: apps }, true)),
    ['preview', 'separator-1', 'copy-path', 'copy-relative-path', 'separator-2', 'insert-reference']);
  assert.deepEqual(ids(model.buildFileMenu(target('directory'), { desktop: false, applications: [] }, false)),
    ['copy-path', 'copy-relative-path', 'separator-1', 'insert-reference']);
});

test('other entries and out-of-workspace paths offer only what is valid', () => {
  assert.deepEqual(ids(model.buildFileMenu(target('other'), { desktop: true, applications: [] }, false)), ['copy-path', 'copy-relative-path']);
  const outside = target('file', { path: 'D:\\x\\a ".ts' });
  assert.deepEqual(ids(model.buildFileMenu(outside, { desktop: false, applications: [] }, false)), ['preview', 'separator-1', 'copy-path']);
  const noRoot = target('file', { cwd: undefined });
  assert.ok(!ids(model.buildFileMenu(noRoot, { desktop: false, applications: [] }, false)).includes('copy-relative-path'));
});

test('labels follow the interface language and commands round-trip', () => {
  assert.equal(model.buildFileMenu(target('file'), { desktop: false, applications: [] }, true)[0].label, 'Preview in side panel');
  assert.equal(model.buildFileMenu(target('file'), { desktop: false, applications: [] }, false)[0].label, '在右侧栏预览');
  assert.deepEqual(model.parseCommand('open-with:vs code'), { type: 'open-with', application: 'vs code' });
  assert.deepEqual(model.parseCommand('reveal'), { type: 'reveal' });
  assert.equal(model.parseCommand('open-with'), undefined);
  assert.equal(model.parseCommand('separator-1'), undefined);
  for (const command of ['preview', 'open', 'reveal', 'copy-path', 'copy-relative-path', 'insert-reference'].map(model.parseCommand)) {
    assert.ok(model.failureMessage(command, false).length > 0);
    assert.ok(model.failureMessage(command, true).length > 0);
  }
});

function createHost({ desktop = true, applications = [], failOpen = false, mounted = true } = {}) {
  const calls = { open: [], opened: [], inserted: [], copied: [] };
  const host = actions.createFileMenuHost({
    session: {
      canOpenWorkspacePath: async () => ({ ok: true, value: desktop }),
      openWorkspacePath: async request => { calls.open.push(request); return failOpen ? { ok: false, error: { code: 'gateway/bad-request' } } : { ok: true, value: { opened: true } }; },
      workspacePathApplications: async () => ({ ok: true, value: applications }),
    },
    openResource: address => calls.opened.push(address),
    insertReference: (sessionId, reference) => { calls.inserted.push({ sessionId, reference }); return mounted; },
    writeClipboard: async text => { calls.copied.push(text); },
  });
  return { host, calls };
}

test('commands reach the Host with the right path forms', async () => {
  const { host, calls } = createHost();
  const file = target('file', { path: 'E:\\proj\\my docs\\a.ts' });
  await host.run({ type: 'preview' }, file);
  await host.run({ type: 'open' }, file);
  await host.run({ type: 'open-with', application: 'code' }, file);
  await host.run({ type: 'reveal' }, file);
  await host.run({ type: 'copy-path' }, file);
  await host.run({ type: 'copy-relative-path' }, file);
  await host.run({ type: 'insert-reference' }, file);
  await host.run({ type: 'insert-reference' }, target('directory', { path: 'E:\\proj\\my docs' }));
  assert.deepEqual(calls.opened, ['dsh-resource://file/session/s1/my%20docs/a.ts']);
  assert.deepEqual(calls.open, [
    { path: 'E:\\proj\\my docs\\a.ts' }, { path: 'E:\\proj\\my docs\\a.ts', application: 'code' }, { path: 'E:\\proj\\my docs\\a.ts', action: 'reveal' },
  ]);
  assert.deepEqual(calls.copied, ['E:\\proj\\my docs\\a.ts', 'my docs/a.ts']);
  assert.deepEqual(calls.inserted, [
    { sessionId: 's1', reference: { mention: '@"my docs/a.ts"', label: 'a.ts', kind: 'file' } },
    { sessionId: 's1', reference: { mention: '@"my docs/"', label: 'my docs/', kind: 'directory' } },
  ]);
});

test('failures reject instead of passing silently', async () => {
  const failing = createHost({ failOpen: true }).host;
  await assert.rejects(failing.run({ type: 'open' }, target('file')), /gateway\/bad-request/u);
  await assert.rejects(failing.run({ type: 'reveal' }, target('file')), /gateway\/bad-request/u);
  const unmounted = createHost({ mounted: false }).host;
  await assert.rejects(unmounted.run({ type: 'insert-reference' }, target('file')), /not mounted/u);
  await assert.rejects(unmounted.run({ type: 'copy-relative-path' }, target('file', { cwd: undefined })), /outside the workspace/u);
  await assert.rejects(unmounted.run({ type: 'insert-reference' }, target('other')), /cannot be referenced/u);
  await assert.rejects(unmounted.run({ type: 'insert-reference' }, target('file', { path: 'E:\\proj\\a"b.ts' })), /cannot be referenced/u);
});

test('desktop availability is read once after a success and retried after a failure', async () => {
  let reads = 0;
  let answer = () => { throw new Error('offline'); };
  const host = actions.createFileMenuHost({
    session: { canOpenWorkspacePath: async () => { reads += 1; return answer(); }, openWorkspacePath: async () => ({ ok: true, value: {} }), workspacePathApplications: async () => ({ ok: true, value: [] }) },
    openResource() {}, insertReference: () => true, writeClipboard: async () => {},
  });
  assert.equal(await host.desktop(), false);
  answer = () => ({ ok: true, value: true });
  assert.equal(await host.desktop(), true);
  assert.equal(await host.desktop(), true);
  assert.equal(reads, 2);
});

test('application lists keep only identity and name', async () => {
  const { host } = createHost({ applications: [{ id: 'code', name: 'Code', default: true, icon: 'data:image/png;base64,AA==' }] });
  assert.deepEqual(await host.applications('E:\\proj\\a.ts', new AbortController().signal), [{ id: 'code', name: 'Code' }]);
});
