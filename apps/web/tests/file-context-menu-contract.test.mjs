import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

// The file context menu reads DSH markers it does not own. These checks pin each marker in the
// installed official packages so a DSH upgrade that moves one fails here instead of silently
// leaving the native menu in place.
const store = fileURLToPath(new URL('../node_modules/.pnpm/', import.meta.url));

function installed(name) {
  const found = readdirSync(store)
    .filter(entry => entry.startsWith('@deepseek-ai+dsh-'))
    .map(entry => join(store, entry, 'node_modules', '@deepseek-ai', name))
    .filter(directory => existsSync(join(directory, 'package.json')));
  assert.ok(found.length > 0, `${name} is installed`);
  return found;
}

function assertEveryCopy(name, file, expectations) {
  for (const directory of installed(name)) {
    const text = readFileSync(join(directory, file), 'utf8');
    for (const [label, pattern] of Object.entries(expectations)) {
      assert.ok(typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text), `${name}/${file}: ${label}`);
    }
  }
}

test('Files tree rows keep their entry, path and root markers', () => {
  assertEveryCopy('dsh-client-ui-sidebar-files', 'lib/client.js', {
    'directory entry': /"data-files-entry": "directory"/u,
    'file entry': /"data-files-entry": "file"/u,
    'other entry': /"data-files-entry": "other"/u,
    'row path': /"data-files-path": path/u,
    'tree root': /"data-files-root": state\.root/u,
    'rows are list items whose first child is the row control': /jsxs\)\("li", \{[^}]*"data-files-entry": "directory",[^}]*"data-files-path": path,\s*children: \[\(0, react_jsx_runtime\.jsxs\)\("button"/u,
  });
});

test('Session owners keep their markers', () => {
  assertEveryCopy('dsh-client-ui-sidebar-right', 'lib/client.js', { 'right sidebar session': '"data-sidebar-right-session": sessionId' });
  assertEveryCopy('dsh-client-ui-conversation', 'lib/client.js', {
    'conversation session': '"data-conversation-session": sessionId',
    'reference insertion event': 'slash/input-insert-reference',
  });
});

test('sent references and assistant file links keep their markers', () => {
  assertEveryCopy('dsh-client-ui-primitives', 'lib/index.js', {
    'reference chip kind': '"data-ref-chip": appearance',
    'chip title is the mention': /"data-ref-chip": appearance,\s*title,/u,
    'file link classes': 'clsx(markdownCss.fileMention, markdownCss.fileLink)',
    'file link title is the path': 'title: src === void 0 ? file.path : void 0',
    'file link is a button': /MarkdownFileLink[\s\S]{0,600}jsxs\("button"/u,
  });
  for (const directory of installed('dsh-web-frontend')) {
    const assets = join(directory, 'dist', 'assets');
    const css = readdirSync(assets).filter(file => file.endsWith('.css')).map(file => readFileSync(join(assets, file), 'utf8')).join('\n');
    assert.match(css, /(?:^|[^\w])_?fileLink_/u, 'compiled file link class');
    assert.match(css, /(?:^|[^\w])_?fileMention_/u, 'compiled file mention class');
  }
});

test('conversation web links stay anchors and keep the official opening paths', () => {
  assertEveryCopy('dsh-client-ui-primitives', 'lib/index.js', {
    'markdown anchor': /function MarkdownAnchor[\s\S]{0,400}jsxs\("a", \{\s*href,\s*\.\.\.external \? \{\s*target: "_blank",\s*rel: "noopener noreferrer"/u,
    'search source anchor': /function SafeLink[\s\S]{0,400}jsxs\("a", \{\s*className,\s*href,\s*target: "_blank",\s*rel: "noopener noreferrer"/u,
  });
  assertEveryCopy('dsh-client-ui-chat', 'lib/client.js', {
    'side panel browser page type': 'ctx.sidebarRight.openTab("browser", { params: { url } })',
    'new tab fallback': 'window.open(url, "_blank", "noopener,noreferrer")',
  });
  for (const directory of installed('dsh-web-frontend')) {
    const assets = join(directory, 'dist', 'assets');
    const script = readdirSync(assets).filter(file => file.endsWith('.js')).map(file => readFileSync(join(assets, file), 'utf8')).join('\n');
    assert.ok(script.includes('jsxs("a",{href:e,...n?{target:"_blank",rel:"noopener noreferrer"}:{}'), 'compiled markdown anchor');
  }
});
test('the bundle client declares every official module it loads at runtime', async () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../packages/bundle/package.json', import.meta.url), 'utf8'));
  const compiled = await build({
    entryPoints: [fileURLToPath(new URL('../../../packages/bundle/src/client/index.ts', import.meta.url))],
    bundle: true, write: false, format: 'cjs', platform: 'browser', target: 'es2022',
    external: ['@deepseek-ai/dsh-client-ui-primitives', 'react'],
  });
  const required = new Set([...compiled.outputFiles[0].text.matchAll(/require\("(@deepseek-ai\/[^"]+)"\)/gu)].map(match => match[1]));
  assert.ok(required.has('@deepseek-ai/dsh-client-ui-primitives'), 'the context menu renders the official Menu');
  for (const name of required) assert.ok(manifest.dsh.client.inject.includes(name), `${name} is injected before the bundle client loads`);
});

test('the Session Remote still exposes the desktop path operations', () => {
  assertEveryCopy('dsh-api-session-controller', 'lib/index.js', {
    'availability': 'Remote("openWorkspacePath")',
    'applications': 'Remote("workspacePathApplications")',
    'reveal action': 'request.action === "reveal"',
  });
});
