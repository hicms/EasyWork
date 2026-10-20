import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';

const requireReact = createRequire(new URL('../../../packages/plugins/models/package.json', import.meta.url));
const installer = fileURLToPath(new URL('../../../packages/bundle/src/client/harness/file-context-menu.ts', import.meta.url));
const bundle = await build({
  stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {installFileContextMenu} from ${JSON.stringify(installer)};
    const calls = { opened: [], open: [], bail: [], disposed: 0, listeners: 0 };
    let overlay;
    let desktop = window.initialDesktop ?? true;
    const ctx = {
      inject: (_names, apply) => apply(ctx),
      effect: factory => { const dispose = factory(); calls.dispose = () => { dispose(); calls.disposed += 1; }; return dispose; },
      sessions: {
        list: { getSnapshot: () => ({ byId: { s1: { cwd: 'E:\\\\proj' }, 'no-root': {} } }) },
        binding: id => id === 's1' ? { ctx: { bail: (_c, name, payload) => { calls.bail.push({ name, payload }); return true; } } } : undefined,
      },
      remote: { session: {
        canOpenWorkspacePath: async () => ({ ok: true, value: desktop }),
        openWorkspacePath: async request => { calls.open.push(request); return request.path.endsWith('fail.ts') ? { ok: false, error: { code: 'gateway/bad-request' } } : { ok: true, value: { opened: true } }; },
        workspacePathApplications: async () => ({ ok: true, value: [{ id: 'code', name: 'Code', default: true, icon: null }] }),
      } },
      sidebarRight: { openResource: address => calls.opened.push(address) },
      conversation: { input: { for: () => ({ state: { getSnapshot: () => ({ draft: 'hi', draftRev: 3 }) } }) } },
      slots: {
        inject: (_name, apply) => apply(),
        register: (options, Component) => { overlay = { options, Component }; return () => { overlay = undefined; }; },
      },
    };
    window.calls = calls;
    installFileContextMenu(ctx);
    const props = overlay.options.inject();
    const subscribe = props.source.subscribe;
    props.source.subscribe = listener => { calls.listeners += 1; const off = subscribe(listener); return () => { calls.listeners -= 1; off(); }; };
    window.root = createRoot(document.getElementById('root'));
    window.root.render(React.createElement(overlay.Component, props));
  `, loader: 'ts', resolveDir: fileURLToPath(new URL('../', import.meta.url)) },
  alias: { react: dirname(requireReact.resolve('react/package.json')), 'react-dom': dirname(requireReact.resolve('react-dom/package.json')) },
  bundle: true, write: false, format: 'iife', platform: 'browser',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    // The real primitives need an app-level dependency graph that this repository does not install;
    // the stand-in keeps the Menu props contract (items, onSelect, onClose, getAnchorRect) and nothing else.
    name: 'primitives-stand-in',
    setup(esbuild) {
      esbuild.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives', namespace: 'stand-in' }));
      esbuild.onLoad({ filter: /.*/, namespace: 'stand-in' }, () => ({
        resolveDir: fileURLToPath(new URL('../../../packages/plugins/models/', import.meta.url)),
        loader: 'jsx',
        contents: `
          import React from 'react';
          export function Menu({ open, items = [], onSelect, onClose, getAnchorRect }) {
            const [sub, setSub] = React.useState(null);
            React.useEffect(() => {
              (window.anchors ??= []).push(getAnchorRect());
              const key = event => { if (event.key === 'Escape') onClose(); };
              const down = event => { if (!event.target.closest('[role=menu]')) onClose(); };
              document.addEventListener('keydown', key);
              document.addEventListener('pointerdown', down);
              return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', down); };
            }, []);
            if (!open) return null;
            const row = item => <div key={item.id}>
              <button type="button" role="menuitem" onMouseEnter={() => setSub(item.submenu ? item.id : null)}
                onClick={() => item.submenu ? setSub(item.id) : onSelect(item.id)}>{item.label}</button>
              {sub === item.id && item.submenu && <div role="menu">{item.submenu.map(row)}</div>}
            </div>;
            return <div role="menu">{items.map(entry => entry.type === 'separator' ? <hr key={entry.id} role="separator" /> : row(entry))}</div>;
          }
          export const Button = () => null, Input = () => null;`,
      }));
    },
  }],
});

const fixture = `<!doctype html><html lang="zh-CN"><body>
<div id="root"></div>
<aside data-sidebar-right-session="s1"><div data-files-root="E:\\proj"><span id="header" data-files-path="true">E:\\proj</span>
  <ul><li data-files-entry="directory" data-files-path="E:\\proj/src"><button id="dir" type="button"><span id="dir-name">src</span></button>
    <ul id="level" style="padding:20px 0"><li data-files-entry="file" data-files-path="E:\\proj/src/a b.ts"><button id="file" type="button">a b.ts</button></li>
        <li data-files-entry="file" data-files-path="E:\\proj/src/fail.ts"><button id="fail" type="button">fail.ts</button></li>
        <li data-files-entry="other" data-files-path="E:\\proj/src/sock"><span id="other">sock</span></li>
        <li data-files-row="loading" id="loading">加载中</li></ul></li></ul>
  </div></aside>
<main data-conversation-session="s1">
  <span id="chip" data-ref-chip="file" title='@"my docs/读我.md"'>读我.md</span>
  <span id="folder" data-ref-chip="folder" title="@src/">src</span>
  <span id="skill" data-ref-chip="skill" title="/review">review</span>
  <button id="link" type="button" class="h4sh_fileMention h4sh_fileLink" title="src/b.ts">b.ts</button>
  <button id="web-link" type="button" class="_fileMention_1ypvv_85 _fileLink_1ypvv_59" title="src/e.ts">e.ts</button>
  <button id="inline" type="button" class="h4sh_fileMention" title="src/c.ts">c.ts</button>
  <button id="plain-button" type="button" class="h4sh_other" title="src/d.ts">d</button>
  <p id="paragraph">普通文字 selectable text</p><textarea id="editor"></textarea>
</main>
<main data-conversation-session="no-root"><span id="rootless" data-ref-chip="file" title="@a.ts">a.ts</span><span id="absolute" data-ref-chip="file" title="@C:/x/y.ts">y.ts</span></main>
</body></html>`;

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('http://localhost/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture }));
  await page.goto('http://localhost/');
  await page.evaluate(() => {
    window.prevented = [];
    document.addEventListener('contextmenu', event => { window.prevented.push(event.defaultPrevented); window.pointer = { x: event.clientX, y: event.clientY }; });
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const items = page.getByRole('menuitem');
  const menuTexts = async () => (await items.allTextContents()).map(text => text.trim());
  const rightClick = async (selector, position) => { await page.evaluate(() => { window.prevented.length = 0; }); await page.locator(selector).click({ button: 'right', position }); };
  const wasPrevented = () => page.evaluate(() => window.prevented.at(-1));
  const closeMenu = async () => { await page.keyboard.press('Escape'); await expect(items).toHaveCount(0); };

  await rightClick('#file');
  assert.equal(await wasPrevented(), true);
  await expect(page.getByRole('menuitem', { name: '打开方式' })).toBeVisible();
  assert.deepEqual(await menuTexts(), ['在右侧栏预览', '打开', '打开方式', '在文件管理器中显示', '复制路径', '复制相对路径', '添加到对话']);
  const pointer = await page.evaluate(() => window.pointer);
  assert.deepEqual(await page.evaluate(() => window.anchors.at(-1)), { x: pointer.x, y: pointer.y - 4, width: 0, height: 0, top: pointer.y - 4, right: pointer.x, bottom: pointer.y - 4, left: pointer.x });
  await closeMenu();

  await rightClick('#dir-name');
  assert.equal(await wasPrevented(), true);
  await expect(page.getByRole('menuitem', { name: '在文件管理器中打开' })).toBeVisible();
  assert.deepEqual(await menuTexts(), ['在文件管理器中打开', '复制路径', '复制相对路径', '添加到对话']);
  await closeMenu();

  await rightClick('#other');
  await expect(page.getByRole('menuitem', { name: '复制路径' })).toBeVisible();
  assert.deepEqual(await menuTexts(), ['复制路径', '复制相对路径']);
  await closeMenu();

  for (const [selector, expected] of [['#chip', ['在右侧栏预览', '打开', '打开方式', '在文件管理器中显示', '复制路径', '复制相对路径', '添加到对话']],
    ['#folder', ['在文件管理器中打开', '复制路径', '复制相对路径', '添加到对话']], ['#link', ['在右侧栏预览', '打开', '打开方式', '在文件管理器中显示', '复制路径', '复制相对路径', '添加到对话']],
    ['#web-link', ['在右侧栏预览', '打开', '打开方式', '在文件管理器中显示', '复制路径', '复制相对路径', '添加到对话']]]) {
    await rightClick(selector);
    assert.equal(await wasPrevented(), true, selector);
    await expect(page.getByRole('menuitem', { name: '复制路径' })).toBeVisible();
    await expect.poll(menuTexts).toEqual(expected);
    await closeMenu();
  }

  await rightClick('#level', { x: 2, y: 2 });
  assert.equal(await wasPrevented(), false, 'directory padding outside the row keeps the native menu');
  await expect(items).toHaveCount(0);
  for (const selector of ['#header', '#loading', '#skill', '#inline', '#plain-button', '#paragraph', '#editor', '#rootless']) {
    await rightClick(selector);
    assert.equal(await wasPrevented(), false, `${selector} keeps the native menu`);
    await expect(items).toHaveCount(0);
  }
  await page.locator('#paragraph').selectText();
  await rightClick('#paragraph');
  assert.equal(await wasPrevented(), false, 'selected text keeps the native copy menu');
  await page.evaluate(() => getSelection().removeAllRanges());

  await rightClick('#absolute');
  assert.equal(await wasPrevented(), true);
  await expect(page.getByRole('menuitem', { name: '复制路径' })).toBeVisible();
  assert.deepEqual(await menuTexts(), ['在右侧栏预览', '打开', '打开方式', '在文件管理器中显示', '复制路径', '添加到对话']);
  await closeMenu();

  await rightClick('#file');
  await page.getByRole('menuitem', { name: '在右侧栏预览' }).click();
  await expect(items).toHaveCount(0);
  await rightClick('#file');
  await page.getByRole('menuitem', { name: '打开', exact: true }).click();
  await rightClick('#file');
  await page.getByRole('menuitem', { name: '在文件管理器中显示' }).click();
  await rightClick('#file');
  await page.getByRole('menuitem', { name: '打开方式' }).hover();
  await page.getByRole('menuitem', { name: 'Code' }).click();
  await rightClick('#file');
  await page.getByRole('menuitem', { name: '复制路径' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('E:\\proj\\src\\a b.ts');
  await rightClick('#file');
  await page.getByRole('menuitem', { name: '复制相对路径' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('src/a b.ts');
  await rightClick('#chip');
  await page.getByRole('menuitem', { name: '添加到对话' }).click();
  await rightClick('#folder');
  await page.getByRole('menuitem', { name: '添加到对话' }).click();
  const calls = await page.evaluate(() => window.calls);
  assert.deepEqual(calls.opened, ['dsh-resource://file/session/s1/src/a%20b.ts']);
  assert.deepEqual(calls.open, [
    { path: 'E:\\proj\\src\\a b.ts' }, { path: 'E:\\proj\\src\\a b.ts', action: 'reveal' }, { path: 'E:\\proj\\src\\a b.ts', application: 'code' },
  ]);
  assert.deepEqual(calls.bail.map(call => [call.name, call.payload.reference.ref, call.payload.reference.label, call.payload.reference.appearance, call.payload.span]), [
    ['slash/input-insert-reference', '@"my docs/读我.md"', '读我.md', 'file', { start: 2, end: 2, draftRev: 3 }],
    ['slash/input-insert-reference', '@src/', 'src/', 'folder', { start: 2, end: 2, draftRev: 3 }],
  ]);

  await rightClick('#fail');
  await page.getByRole('menuitem', { name: '打开', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('无法在本机打开该路径');
  await page.evaluate(() => { document.documentElement.lang = 'en-US'; });
  await rightClick('#file');
  await expect(page.getByRole('menuitem', { name: 'Reveal in file manager' })).toBeVisible();
  await closeMenu();

  const headless = await context.newPage();
  await headless.addInitScript(() => { window.initialDesktop = false; });
  await headless.route('http://localhost/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture.replace('lang="zh-CN"', 'lang="en-US"') }));
  await headless.goto('http://localhost/');
  await headless.addScriptTag({ content: bundle.outputFiles[0].text });
  await headless.locator('#file').click({ button: 'right' });
  await expect(headless.getByRole('menuitem', { name: 'Copy path' })).toBeVisible();
  assert.deepEqual((await headless.getByRole('menuitem').allTextContents()).map(text => text.trim()), ['Preview in side panel', 'Copy path', 'Copy relative path', 'Add to chat']);

  await page.evaluate(() => { window.calls.dispose(); window.root.unmount(); });
  await rightClick('#file');
  assert.equal(await wasPrevented(), false, 'listener is removed on disposal');
  assert.equal(await page.evaluate(() => window.calls.listeners), 0);
  assert.deepEqual(errors.filter(message => !message.includes('gateway/bad-request') && !message.includes('文件菜单操作失败')), []);
  console.log('File context menu: tree, chips, links, fall-through, actions, localization and disposal passed');
} finally {
  await browser.close();
}
