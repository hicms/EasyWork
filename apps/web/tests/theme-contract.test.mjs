import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { build } from 'esbuild';
import { officialWebClients } from '../scripts/official-web-clients.mjs';

const tokenSource = fileURLToPath(new URL('../../../packages/ui/src/styles/tokens.ts', import.meta.url));
const appearanceSource = fileURLToPath(new URL('../../../packages/bundle/src/client/harness/appearance.ts', import.meta.url));
const uiRequire = createRequire(new URL('../../../packages/ui/package.json', import.meta.url));
const composition = await officialWebClients();
const officialSources = await Promise.all(composition.clients.map(async client => ({
  name: client.package,
  source: await readFile(createRequire(client.path).resolve(`${client.package}/client`), 'utf8'),
})));
const themeSource = officialSources.find(client => client.name === '@deepseek-ai/dsh-client-ui-theme').source;
const primitiveSource = await readFile(uiRequire.resolve('@deepseek-ai/dsh-client-ui-primitives'), 'utf8');
const primitiveDirectory = dirname(uiRequire.resolve('@deepseek-ai/dsh-client-ui-primitives'));
// The published primitives ship CSS sidecars; placeholders and controls consume
// tokens there rather than in the JS module. Include the actual installed files.
const primitiveStyles = await Promise.all((await readdir(primitiveDirectory, { recursive: true }))
  .filter(file => file.endsWith('.css')).map(file => readFile(join(primitiveDirectory, file), 'utf8')));

// Compile current owned sources in memory. No stale dist, dependency installation or upstream build.
async function currentModule(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint], bundle: true, write: false, platform: 'node', format: 'cjs',
    alias: { 'easywork-ui': tokenSource },
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports });
  return module.exports;
}
const { themeTokenOverrides } = await currentModule(tokenSource);
const { installAppearance } = await currentModule(appearanceSource);

function officialTheme(t, preference = 'system') {
  const mediaListeners = new Set();
  const settingsListeners = new Set();
  const lifecycle = [];
  const writes = [];
  const events = [];
  const media = {
    matches: false,
    addEventListener: (_name, listener) => mediaListeners.add(listener),
    removeEventListener: (_name, listener) => mediaListeners.delete(listener),
  };
  let exported;
  // Only ThemeRuntime runs here. Presentation imports must remain unused in its DOM-free contract.
  const unusedPresentation = new Proxy({}, { get: (_target, name) => () => { throw Error(`Unexpected presentation call: ${String(name)}`); } });
  runInNewContext(themeSource, {
    window: { __ModuleLoader__: { load: definition => {
      assert.equal(definition.id, '@deepseek-ai/dsh-client-ui-theme');
      exported = definition.factory(() => unusedPresentation);
    } } },
    matchMedia: () => media,
  });
  const ctx = {
    effect: factory => { const dispose = factory(); lifecycle.push(dispose); return dispose; },
    emit: (name, snapshot) => events.push({ name, snapshot }),
  };
  const value = { preference, fontSize: 16 };
  const host = {
    getSnapshot: () => ({ value }),
    subscribe: listener => { settingsListeners.add(listener); return () => settingsListeners.delete(listener); },
    set: (key, next) => { writes.push([key, next]); value[key] = next; },
  };
  const theme = new exported.ThemeRuntime(ctx, host);
  t.after(() => lifecycle.reverse().forEach(dispose => dispose()));
  return {
    theme, writes, events,
    systemDark(dark) { media.matches = dark; for (const listener of mediaListeners) listener(); },
    persisted(preference) { value.preference = preference; for (const listener of settingsListeners) listener(); },
  };
}

function mountAppearance(theme) {
  const disposers = [];
  const scope = { theme, effect: factory => { const dispose = factory(); disposers.push(dispose); return dispose; } };
  installAppearance({ inject: (names, apply) => {
    assert.deepEqual(Array.from(names), ['theme']);
    apply(scope);
  } });
  assert.equal(disposers.length, 1, 'appearance must own exactly one managed token layer');
  return () => disposers.reverse().forEach(dispose => dispose());
}

test('every overridden token is defined and consumed by the locked published UI', () => {
  const defined = new Set(Array.from(themeSource.matchAll(/(--dsw-[a-z0-9-]+):/g), match => match[1]));
  const rendered = [...officialSources.map(client => client.source), primitiveSource, ...primitiveStyles].join('\n');
  const consumed = new Set(Array.from(rendered.matchAll(/var\((--dsw-[a-z0-9-]+)/g), match => match[1]));
  assert.deepEqual(Object.keys(themeTokenOverrides).filter(name => !consumed.has(name)), [], 'overrides must have published official consumers');
  for (const [name, modes] of Object.entries(themeTokenOverrides)) {
    assert.ok(defined.has(name), `${name} is no longer declared by official ui-theme ${composition.version}`);
    assert.ok(consumed.has(name), `${name} is no longer consumed by the published official UI`);
    assert.equal(typeof modes.light, 'string');
    assert.equal(typeof modes.dark, 'string');
  }
});

test('appearance follows system and persisted modes without changing user preference or font size', t => {
  const f = officialTheme(t);
  const dispose = mountAppearance(f.theme);
  assert.equal(f.theme.getTheme().preference, 'system');
  assert.equal(f.theme.getTheme().fontSize, 16);
  const name = '--dsw-specific-sidebar-fill';
  assert.equal(f.theme.getTheme().active.tokens[name], themeTokenOverrides[name].light);
  f.systemDark(true);
  assert.equal(f.theme.getTheme().active.tokens[name], themeTokenOverrides[name].dark);
  f.persisted('light');
  assert.equal(f.theme.getTheme().active.tokens[name], themeTokenOverrides[name].light);
  f.persisted('dark');
  assert.equal(f.theme.getTheme().active.tokens[name], themeTokenOverrides[name].dark);
  dispose();
  assert.equal(f.theme.getTheme().preference, 'dark');
  assert.equal(f.theme.getTheme().fontSize, 16);
  assert.equal(Object.keys(f.theme.getTheme().active.tokens).length, 0);
  assert.deepEqual(f.writes, [], 'appearance may never write persisted theme/font preferences');
  assert.ok(f.events.every(event => event.name === 'theme/change'));
});

test('unloading restores covered layers and does not remove later independent overrides', t => {
  const f = officialTheme(t, 'light');
  const name = '--dsw-alias-bg-base';
  const baseline = { light: '#abcdef', dark: '#123456' };
  const removeEarlier = f.theme.overrideTokens('fixture-earlier', { [name]: baseline });
  const dispose = mountAppearance(f.theme);
  assert.equal(f.theme.getTheme().active.tokens[name], themeTokenOverrides[name].light);
  const removeLater = f.theme.overrideTokens('fixture-later', { [name]: { light: '#112233', dark: '#445566' } });
  dispose();
  assert.equal(f.theme.getTheme().active.tokens[name], '#112233');
  removeLater();
  assert.equal(f.theme.getTheme().active.tokens[name], baseline.light);
  f.persisted('dark');
  assert.equal(f.theme.getTheme().active.tokens[name], baseline.dark);
  removeEarlier();
  assert.deepEqual(f.writes, []);
});

test('stale disposal cannot tear down a replacement of the same appearance layer', t => {
  const f = officialTheme(t);
  const first = mountAppearance(f.theme);
  const replacement = mountAppearance(f.theme);
  first();
  assert.equal(f.theme.getTheme().active.tokens['--dsw-alias-bg-base'], themeTokenOverrides['--dsw-alias-bg-base'].light);
  replacement();
  assert.equal(Object.keys(f.theme.getTheme().active.tokens).length, 0);
  assert.deepEqual(f.writes, []);
});
