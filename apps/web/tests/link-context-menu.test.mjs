import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

const source = relative => fileURLToPath(new URL(`../../../packages/bundle/src/client/link-menu/${relative}`, import.meta.url));

async function load(entry) {
  const compiled = await build({ entryPoints: [source(entry)], bundle: true, write: false, platform: 'neutral', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
}

const model = await load('menu-model.ts');
const actions = await load('actions.ts');

const ids = entries => entries.map(entry => entry.id);

test('the side panel row exists only where the browser page type is registered', () => {
  assert.deepEqual(ids(model.buildLinkMenu(true, false)), ['open-sidebar', 'open-browser', 'separator-1', 'copy-link']);
  assert.deepEqual(ids(model.buildLinkMenu(false, false)), ['open-browser', 'separator-1', 'copy-link']);
});

test('labels follow the interface language and commands round-trip', () => {
  assert.deepEqual(model.buildLinkMenu(true, false).filter(entry => entry.label).map(entry => entry.label), ['在侧栏浏览器中打开', '在浏览器中打开', '复制链接地址']);
  assert.deepEqual(model.buildLinkMenu(true, true).filter(entry => entry.label).map(entry => entry.label), ['Open in side panel browser', 'Open in browser', 'Copy link address']);
  for (const command of ['open-sidebar', 'open-browser', 'copy-link']) {
    assert.equal(model.parseLinkCommand(command), command);
    assert.ok(model.linkFailureMessage(command, false).length > 0);
    assert.ok(model.linkFailureMessage(command, true).length > 0);
  }
  assert.equal(model.parseLinkCommand('separator-1'), undefined);
  assert.equal(model.parseLinkCommand('open'), undefined);
});

test('commands reach the host with the link address', async () => {
  const calls = [];
  const host = actions.createLinkMenuHost({
    sidebarBrowserAvailable: () => true,
    openInSidebarBrowser: url => calls.push(['sidebar', url]),
    openInBrowser: url => calls.push(['browser', url]),
    writeClipboard: async text => { calls.push(['copy', text]); },
  });
  const target = { url: 'https://example.com/a?b=1#c', sessionId: 's1' };
  await host.run('open-sidebar', target);
  await host.run('open-browser', target);
  await host.run('copy-link', target);
  assert.deepEqual(calls, [['sidebar', target.url], ['browser', target.url], ['copy', target.url]]);
  assert.equal(host.sidebarBrowserAvailable(), true);
});

test('opening happens before the first await and failures reject', async () => {
  let opened = false;
  const host = actions.createLinkMenuHost({
    sidebarBrowserAvailable: () => false,
    openInSidebarBrowser: () => { throw new Error('no tab'); },
    openInBrowser: () => { opened = true; },
    writeClipboard: async () => { throw new Error('denied'); },
  });
  const target = { url: 'https://example.com/', sessionId: 's1' };
  const pending = host.run('open-browser', target);
  assert.equal(opened, true, 'the popup is opened inside the user gesture');
  await pending;
  await assert.rejects(host.run('open-sidebar', target), /no tab/u);
  await assert.rejects(host.run('copy-link', target), /denied/u);
});
