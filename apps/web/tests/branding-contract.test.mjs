import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { build } from 'esbuild';
import { officialWebClients } from '../scripts/official-web-clients.mjs';

const { clients } = await officialWebClients();
async function officialSource(name) {
  const client = clients.find(row => row.package === name);
  return readFile(createRequire(client.path).resolve(`${name}/client`), 'utf8');
}
const [localeSource, conversationSource, chatSource] = await Promise.all([
  officialSource('@deepseek-ai/dsh-client-locale'),
  officialSource('@deepseek-ai/dsh-client-ui-conversation'),
  officialSource('@deepseek-ai/dsh-client-ui-chat'),
]);
let localeModule;
runInNewContext(localeSource, {
  navigator: { languages: ['zh-CN'], language: 'zh-CN' },
  window: { __ModuleLoader__: { load: definition => { localeModule = definition.factory(() => ({})); } } },
});

// Current owned sources run in memory; no dist, runtime preparation or app build.
const bundleRequire = createRequire(new URL('../../../packages/bundle/package.json', import.meta.url));
const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../../../packages/bundle/src/client/harness/branding.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react/jsx-runtime'],
  alias: { 'easywork-ui': fileURLToPath(new URL('../../../packages/ui/src/components/LogoMark.tsx', import.meta.url)) },
});
const owned = { exports: {} };
runInNewContext(compiled.outputFiles[0].text, { module: owned, exports: owned.exports, require: bundleRequire });
const { installBranding } = owned.exports;

function dictionaries(source, names) {
  const dicts = { zh: {}, en: {} };
  for (const name of names) {
    const prefix = `${JSON.stringify(name)}: `;
    const values = source.split('\n').map(line => line.trim()).filter(line => line.startsWith(prefix))
      .map(line => JSON.parse(line.slice(prefix.length).replace(/,$/, '')));
    assert.equal(values.length, 2, `locked official bilingual key: ${name}`);
    [dicts.zh[name], dicts.en[name]] = values;
  }
  return dicts;
}
const nativeConversation = dictionaries(conversationSource, ['hero.headline', 'hero.preview', 'hero.chooseWorkspace']);
const nativeChat = dictionaries(chatSource, [
  'chat.deepDiving', 'chat.deepDivingFor', 'chat.loadOlder',
  'message.stepProcess.thinking', 'message.stepProcess.done.thinking',
]);

function fixture(t) {
  const lifecycle = [];
  const slots = [];
  const writes = [];
  const settings = { locale: 'zh' };
  const locale = new localeModule.LocaleRuntime({ effect: factory => factory(), emit() {} }, {
    getSnapshot: () => ({ value: settings }), subscribe: () => () => {},
    set: (key, value) => { writes.push([key, value]); settings[key] = value; },
  });
  locale.register('conversation', nativeConversation);
  locale.register('chat', nativeChat);
  locale.register('fixture', { zh: { 'chat.deepDiving': '独立插件文案' }, en: { 'chat.deepDiving': 'Independent plugin' } });
  const ctx = {
    get: name => { assert.equal(name, 'locale'); return locale; },
    effect: factory => { const dispose = factory(); lifecycle.push(dispose); return dispose; },
    inject: (names, apply) => { assert.deepEqual(Array.from(names), ['locale']); apply(ctx); },
    slots: {
      inject: (name, install) => { assert.equal(name, 'conversation.hero.brand.mark'); return ctx.effect(install); },
      register: (options, component) => {
        const entry = { options, component }; slots.push(entry);
        return () => slots.splice(slots.indexOf(entry), 1);
      },
    },
  };
  const dispose = () => lifecycle.splice(0).reverse().forEach(fn => fn());
  t.after(dispose);
  return { locale, slots, writes, ctx, dispose };
}

test('locked native presenters still consume the hero mark slot and translated status keys', async () => {
  assert.ok(conversationSource.includes('renderSlot("conversation.hero.brand.mark"'));
  assert.ok(conversationSource.includes('t("hero.headline")'));
  assert.ok(chatSource.includes('t("chat.deepDiving")'));
  assert.ok(chatSource.includes('t("chat.deepDivingFor", { duration:'));
  const manifest = JSON.parse(await readFile(new URL('../../../packages/bundle/package.json', import.meta.url), 'utf8'));
  for (const name of ['@deepseek-ai/dsh-client-locale', '@deepseek-ai/dsh-client-ui-conversation']) assert.ok(manifest.dsh.client.inject.includes(name));
});

test('EasyWork replaces the native headline and thinking copy, preserving duration and other namespaces', t => {
  const f = fixture(t);
  assert.equal(f.locale.bind('conversation')('hero.headline'), '探索未至之境');
  assert.equal(f.locale.bind('chat')('chat.deepDiving'), '深度求索中');
  const revision = f.locale.getSnapshot().revision;
  installBranding(f.ctx);
  assert.ok(f.locale.getSnapshot().revision > revision, 'mounted native presenters receive a locale revision');
  const conversation = f.locale.bind('conversation');
  const chat = f.locale.bind('chat');
  assert.equal(conversation('hero.headline'), 'EasyWork');
  assert.equal(conversation('hero.preview'), nativeConversation.zh['hero.preview']);
  assert.equal(conversation('hero.chooseWorkspace'), nativeConversation.zh['hero.chooseWorkspace']);
  assert.equal(chat('chat.deepDiving'), '正在思考…');
  assert.equal(chat('chat.deepDivingFor', { duration: '2分3秒' }), '正在思考，已用时 2分3秒…');
  assert.equal(chat('message.stepProcess.thinking'), '正在思考…');
  assert.equal(chat('message.stepProcess.done.thinking'), '思考完成');
  assert.equal(chat('chat.loadOlder'), nativeChat.zh['chat.loadOlder']);
  assert.equal(f.locale.bind('fixture')('chat.deepDiving'), '独立插件文案');
  assert.equal(f.locale.bind('chat'), chat, 'namespace bindings keep stable identity');
  assert.equal(f.locale.getSnapshot().active, 'zh');
  assert.deepEqual(f.writes, [], 'branding does not write the language preference');
  const mark = f.slots[0].component({ size: 34, className: 'native-mark' });
  assert.equal(mark.props.className, 'native-mark');
  assert.equal(mark.props.children.props.size, 34);
});

test('native language switching and fallback remain live through existing translated references', t => {
  const f = fixture(t);
  installBranding(f.ctx);
  const chat = f.locale.bind('chat');
  f.locale.setLocale('en');
  assert.equal(chat('chat.deepDivingFor', { duration: '3s' }), 'Thinking for 3s…');
  assert.equal(chat('message.stepProcess.done.thinking'), 'Thinking complete');
  f.locale.addLanguage({ id: 'fr', label: 'Français', fallback: 'en' });
  f.locale.setLocale('fr');
  assert.equal(chat('chat.deepDiving'), 'Thinking…');
  assert.equal(chat('chat.loadOlder'), nativeChat.en['chat.loadOlder']);
  f.locale.setLocale('zh');
  assert.equal(chat('chat.deepDiving'), '正在思考…');
});

test('unloading restores native branding, removes its mark and keeps the selected language', t => {
  const f = fixture(t);
  const originalBind = f.locale.bind;
  installBranding(f.ctx);
  const held = f.locale.bind('chat');
  f.locale.setLocale('en');
  f.dispose();
  assert.equal(f.locale.bind, originalBind);
  assert.equal(f.locale.bind('conversation')('hero.headline'), 'Into the Unknown');
  assert.equal(held('chat.deepDiving'), nativeChat.en['chat.deepDiving']);
  assert.equal(f.locale.bind('easywork.branding')('hero.headline'), 'hero.headline');
  assert.equal(f.locale.getSnapshot().active, 'en');
  assert.equal(f.slots.length, 0);
  installBranding(f.ctx);
  assert.equal(f.locale.bind('conversation')('hero.headline'), 'EasyWork');
});
