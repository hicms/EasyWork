import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire, Module } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { build } = createRequire(new URL('../../../../apps/web/package.json', import.meta.url))('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
async function source(path) {
  const filename = fileURLToPath(new URL(path, import.meta.url));
  const result = await build({ entryPoints: [filename], bundle: true, write: false, platform: 'node', format: 'cjs', target: 'node22', external: ['react'] });
  const module = new Module(filename); module.filename = filename; module.paths = Module._nodeModulePaths(fileURLToPath(new URL('../', import.meta.url)));
  module._compile(result.outputFiles[0].text, filename); return module.exports;
}
const row = { id: 'model', name: 'Sample model', vendor: 'vendor', tier: 'balanced', protocol: 'openai-completions', priceMultiplier: 1.5, supportsTools: true, supportsImages: true, supportsReasoning: true, contextWindow: 200_000, isDefault: true };
test('model list renders service metadata and filters without embedding credentials', async () => {
  const { ModelList, filterModels } = await source('../src/client/ModelList.tsx');
  assert.equal(filterModels([row], ' VENDOR ').length, 1); assert.equal(filterModels([row], 'missing').length, 0);
  const html = renderToStaticMarkup(React.createElement(ModelList, { models: [row], selected: row.id, onSelect() {} }));
  for (const value of ['Sample model', '均衡', '1.5×', '支持工具调用', '支持图片输入', '200K', 'aria-selected="true"', '<svg']) assert.ok(html.includes(value), value);
  assert.ok(!html.includes('ew-tags')); assert.ok(!html.includes('openai-completions'));
});

test('vendor artwork is local, has distinct gradient ids and includes a generic fallback', async () => {
  const { VendorIcon } = await source('../src/client/Icons.tsx');
  const html = renderToStaticMarkup(React.createElement('div', null,
    React.createElement(VendorIcon,{vendor:'google'}),React.createElement(VendorIcon,{vendor:'google'}),React.createElement(VendorIcon,{vendor:'future-vendor'})));
  assert.equal((html.match(/<svg/g) ?? []).length,3); assert.equal(html.includes('<img'),false);
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match=>match[1]); assert.equal(ids.length,new Set(ids).size);
  assert.ok(html.includes('future-vendor'));
});

test('thinking choices render as labelled pressed buttons with exact typed values and pending state', async () => {
  const { ReasoningControls } = await source('../src/client/ReasoningControls.tsx');
  const controls = [
    {path:'reasoning_effort',values:['low','high'],default:'high'},
    {path:'thinking.display',values:[true,false],default:true},
    {path:'thinking.type',values:[{type:'enabled',keep:'all'},{type:'disabled'}],default:{type:'enabled',keep:'all'}},
  ];
  const values = Object.fromEntries(controls.map(control=>[control.path,control.default]));
  const html = renderToStaticMarkup(React.createElement(ReasoningControls,{controls,values,disabled:false,onChange(){}}));
  assert.equal(html.includes('<select'),false); assert.equal((html.match(/<button/g)??[]).length,6);
  assert.equal((html.match(/aria-pressed="true"/g)??[]).length,3);
  for(const text of ['推理强度','思考内容','思考模式','>低<','>高<','>开启<','>关闭<','keep'])assert.ok(html.includes(text),text);
  const pending = renderToStaticMarkup(React.createElement(ReasoningControls,{controls,values,disabled:true,onChange(){}}));
  assert.equal((pending.match(/disabled=""/g)??[]).length,6);
  const ambiguous = renderToStaticMarkup(React.createElement(ReasoningControls,{controls:[{path:'thinking',values:[{type:'enabled',budget:1},{type:'enabled',budget:2}]}],values:{},disabled:false,onChange(){}}));
  assert.ok(ambiguous.includes('budget')); assert.ok(ambiguous.includes(':1}')); assert.ok(ambiguous.includes(':2}'));
});
test('account page offers login when signed out and server models plus logout when signed in', async () => {
  const { AccountModels } = await source('../src/client/AccountModels.tsx');
  let state = { snapshot: { user: null, models: [], error: null }, ready: true, busy: false, error: null };
  const account = { subscribe() { return () => {}; }, getSnapshot: () => state };
  const loggedOut = renderToStaticMarkup(React.createElement(AccountModels, { account }));
  assert.ok(loggedOut.includes('type="email"')); assert.ok(loggedOut.includes('type="password"')); assert.ok(!loggedOut.includes('value="test password"'));
  state = { ...state, snapshot: { user: { email: 'user@example.test' }, models: [row], error: null } };
  const loggedIn = renderToStaticMarkup(React.createElement(AccountModels, { account }));
  assert.ok(loggedIn.includes('退出登录')); assert.ok(loggedIn.includes('Sample model')); assert.ok(!loggedIn.includes('type="password"'));
});
test('the complete client bundle contains no Host adapter, credential store or external service transport', async () => {
  const result = await build({ entryPoints: [fileURLToPath(new URL('../src/client.tsx', import.meta.url))], bundle: true, write: false, metafile: true, platform: 'browser', format: 'cjs', external: ['react'] });
  const inputs = Object.keys(result.metafile.inputs).join('\n');
  for (const hostFile of ['account.ts', 'model-adapter.ts', 'ask-client.ts', 'web-search.ts', 'web-fetch.ts']) assert.equal(inputs.includes('/src/' + hostFile), false, hostFile);
  assert.ok(result.outputFiles[0].text.includes('/api/easywork-models'));
  assert.equal(result.outputFiles[0].text.includes('/api/auth/login'), false);
});
