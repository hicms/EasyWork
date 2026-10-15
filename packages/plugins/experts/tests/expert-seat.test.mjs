import assert from 'node:assert/strict';
import { test } from 'node:test';
import { source } from './source.mjs';

const { resolveExpertSeat } = await source("export { resolveExpertSeat } from './client/expert-seat.ts';");
const preset = 'wd-exp-requirement-analysis-advisor-example';
const unbound = () => Object.assign(new Error('unbound'), { code: 'experts/not-found', details: { reason: 'unbound' } });
const signal = () => new AbortController().signal;

test('a new composer without a Session never claims the default expert was summoned', async () => {
  const management = { verifyBinding: () => assert.fail('no Session to verify'), get: () => assert.fail('not a summoned expert') };
  assert.equal(await resolveExpertSeat(management, undefined, preset, signal()), undefined);
});

test('an ordinary Session inheriting an expert preset is recoverable, not an expert label', async () => {
  const management = { verifyBinding: async () => { throw unbound(); }, get: () => assert.fail('unbound expert must not be named') };
  assert.equal(await resolveExpertSeat(management, 'ordinary', preset, signal()), undefined);
});

test('a summoned expert is named from its verified revision even when the public roster hides it', async () => {
  const management = {
    verifyBinding: async id => { assert.equal(id, 'bound'); return { presetRevisionRef: preset, expertRevisionRef: { expertId: 'advisor', revisionId: 'v1' } }; },
    get: async (id, revision) => { assert.equal(id, 'advisor'); assert.equal(revision, 'v1'); return { revision: { definition: { name: '需求分析顾问' } } }; },
  };
  assert.equal(await resolveExpertSeat(management, 'bound', preset, signal()), '需求分析顾问');
  await assert.rejects(resolveExpertSeat(management, 'bound', 'wd-exp-other', signal()), /不一致/);
});

test('network, authorization and missing expert errors cannot trigger a silent preset reset', async () => {
  for (const error of [new Error('network'), Object.assign(new Error('denied'), { code: 'experts/forbidden' }), Object.assign(new Error('missing'), { code: 'experts/not-found' })]) {
    await assert.rejects(resolveExpertSeat({ verifyBinding: async () => { throw error; } }, 'bound', preset, signal()), cause => cause === error);
  }
});

test('a late binding response from a previous composer cannot publish its label', async () => {
  const controller = new AbortController();
  const management = { verifyBinding: async () => { controller.abort(); return { presetRevisionRef: preset }; }, get: () => assert.fail('cancelled Session') };
  await assert.rejects(resolveExpertSeat(management, 'previous', preset, controller.signal), { name: 'AbortError' });
});
