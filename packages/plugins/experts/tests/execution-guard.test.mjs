import assert from 'node:assert/strict';
import { test } from 'node:test';
import { source } from './source.mjs';

const { registerExpertExecutionGuard, ExpertsError } = await source(`
  export { registerExpertExecutionGuard } from './runtime/execution-guard.ts';
  export { ExpertsError } from './domain/values.ts';
`);
const expert = 'wd-exp-advisor-example';

function fixture(headerPreset, livePreset, bound = false) {
  const hooks = new Map();
  const agent = { id: 'session', ctx: {}, session: { header: { agentPreset: headerPreset } } };
  const ctx = {
    agentTeams: { tryMembership: () => undefined },
    agentPresets: { composedPreset: () => livePreset },
    easyworkIdentity: { resolve: async () => ({ principalId: 'local' }) },
    easyworkExperts: { resolveNativeRole: async () => {
      if (!bound) throw new ExpertsError('experts/not-found', 'unbound', { reason: 'unbound' });
      return { binding: { presetRevisionRef: expert }, revision: { definition: {} } };
    } },
    on: (name, hook) => hooks.set(name, hook),
  };
  registerExpertExecutionGuard(ctx);
  return { run: () => hooks.get('agent/pre-step')({ agent, signal: new AbortController().signal }, () => 'model-step') };
}

test('ordinary standard conversations do not need an expert binding', async () => {
  assert.equal(await fixture('standard', 'standard').run(), 'model-step');
});

test('a blank conversation switched back to standard no longer fails against its original header', async () => {
  assert.equal(await fixture(expert, 'standard').run(), 'model-step');
});

test('an unbound expert composition remains blocked even with an ordinary creation header', async () => {
  await assert.rejects(fixture('standard', expert).run(), error => error.code === 'experts/not-found');
  await assert.rejects(fixture(expert, undefined).run(), error => error.code === 'experts/not-found');
});

test('a bound expert continues only with its pinned composition', async () => {
  assert.equal(await fixture(expert, expert, true).run(), 'model-step');
  await assert.rejects(fixture(expert, 'standard', true).run(), error => error.code === 'experts/conflict');
});
