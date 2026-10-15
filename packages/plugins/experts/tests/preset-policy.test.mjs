import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { Context, Service } from '@deepseek-ai/cordis';
import Loader from '@deepseek-ai/cordis-plugin-loader';
import { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry';
import { source } from './source.mjs';

const { registerExpertPresetPolicy } = await source("export { registerExpertPresetPolicy } from './runtime/preset-policy.ts';");
const expert = 'wd-exp-requirement-analysis-advisor-example';
const { createScope } = createRequire(import.meta.resolve('@deepseek-ai/dsh-agent-preset-registry'))('@deepseek-ai/dsh-scope');

class Registry extends Service {
  config;
  constructor(ctx, config) { super(ctx, 'agentPresets'); this.config = config; }
  get defaultId() { return this.config.selectedDefault.get() ?? this.config.default; }
  async list() { return [{ id: 'standard' }, { id: 'custom' }, { id: expert }]; }
  async remoteExportList() { return { presets: (await this.list()).map(row => ({ ...row, isDefault: row.id === this.defaultId })) }; }
  async resolve(id) { return { id: id ?? this.defaultId }; }
  async select(_agent, id) { return id; }
}

async function fixture(t, selected = expert, fallback = 'standard') {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  const config = { default: fallback, selectedDefault: { get: () => selected } };
  const owner = ctx.plugin(Registry, config); await owner;
  const policy = ctx.plugin({ name: 'expert-preset-policy-test', inject: ['agentPresets'], apply: registerExpertPresetPolicy });
  await policy;
  return { ctx, policy, owner, config };
}

test('a saved expert default resolves to standard and is absent from public Settings choices', async t => {
  const { ctx } = await fixture(t);
  assert.equal((await ctx.agentPresets.resolve()).id, 'standard');
  assert.deepEqual(await ctx.agentPresets.remoteExportList(), { presets: [{ id: 'standard', isDefault: true }, { id: 'custom', isDefault: false }] });
  // Trusted summon still resolves its frozen expert; only public choices are filtered.
  assert.equal((await ctx.agentPresets.resolve(expert)).id, expert);
  assert.equal((await ctx.agentPresets.list()).length, 3);
});

test('native user defaults and native deployment defaults are retained', async t => {
  for (const [selected, fallback, expected] of [['custom', 'standard', 'custom'], [expert, 'custom', 'custom'], [expert, expert, 'standard']]) {
    const { ctx } = await fixture(t, selected, fallback);
    assert.equal(ctx.agentPresets.defaultId, expected);
  }
});

test('Settings validation rejects internal defaults before persistence, including resolved expressions', async t => {
  const { ctx, owner } = await fixture(t);
  for (const raw of [{ default: 'standard', selectedDefault: expert }, { default: expert }]) {
    assert.throws(() => owner.ctx.waterfall(owner.ctx.fiber, 'internal/config', raw, () => raw), /专家中心/);
  }
  assert.throws(() => owner.ctx.waterfall(owner.ctx.fiber, 'internal/config', {}, () => ({ selectedDefault: expert })), /专家中心/);
  assert.deepEqual(owner.ctx.waterfall(owner.ctx.fiber, 'internal/config', {}, () => ({ selectedDefault: 'custom' })), { selectedDefault: 'custom' });
  // The policy must not veto unrelated plugins' similarly named fields.
  const other = { selectedDefault: expert };
  assert.equal(ctx.waterfall(ctx.fiber, 'internal/config', other, () => other), other);
});

test('ordinary preset selection cannot switch into an internal expert', async t => {
  const { ctx } = await fixture(t);
  await assert.rejects(async () => ctx.agentPresets.select({}, expert), /专家中心/);
  assert.equal(await ctx.agentPresets.select({}, 'standard'), 'standard');
});

test('unloading restores the official methods, getter and validation lifecycle', async t => {
  const { ctx, policy, owner } = await fixture(t);
  await policy.dispose();
  assert.equal(ctx.agentPresets.defaultId, expert);
  assert.equal((await ctx.agentPresets.remoteExportList()).presets.length, 3);
  assert.equal(await ctx.agentPresets.select({}, expert), expert);
  const raw = { selectedDefault: expert };
  assert.equal(owner.ctx.waterfall(owner.ctx.fiber, 'internal/config', raw, () => raw), raw);
});

test('the installed official registry uses the safe default for resolve and mount', async t => {
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  ctx.provide('sessionProjections', { register: () => () => {} });
  await ctx.plugin(Loader, { baseUrl: new URL('../', import.meta.url).href });
  await ctx.plugin(AgentPresetRegistry, { default: 'standard', selectedDefault: expert });
  await ctx.plugin({ name: 'actual-preset-policy-test', inject: ['agentPresets'], apply: registerExpertPresetPolicy });
  for (const id of ['standard', expert]) {
    const dispose = await ctx.agentPresets.register({ id, plugins: [] });
    t.after(dispose);
  }
  assert.equal((await ctx.agentPresets.resolve()).id, 'standard');
  assert.equal((await ctx.agentPresets.resolve(expert)).id, expert);
  assert.deepEqual((await ctx.agentPresets.remoteExportList()).presets.map(row => row.id), ['standard']);
  const agentScope = createScope(ctx, {}); t.after(() => agentScope.dispose());
  assert.equal((await ctx.agentPresets.mount(agentScope.ctx)).id, 'standard');
});
