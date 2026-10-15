import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionModels } from '../src/client/selection.ts';
import { model } from './fixture.ts';
import { encodeControls } from '../src/catalog.ts';

test('composer and command share official projection and selectModel; a rejected switch preserves the previous choice', async () => {
  let projection: unknown = { next: { provider: 'easywork', model: model.id } };
  let project = () => {}; let reject = false; const calls: unknown[] = [];
  const sessions = { binding: () => ({ session: { projections: { faceOf: () => ({ getSnapshot: () => projection, subscribe: (listener: () => void) => { project = listener; return () => {}; } }) } } }), subagentAddress: () => undefined };
  const ctx = { remote: { session: {
    modelCatalog: async () => ({ ok: true, value: { default: { provider: 'easywork', model: model.id } } }),
    selectModel: async (request: Record<string, unknown>) => { calls.push(request); return reject ? { ok: false, error: { code: 'session/writer-held' } } : { ok: true, value: { selected: request } }; },
  } } };
  const selection = new SessionModels(ctx as never, 'session' as never, { refresh: async () => {} } as never, sessions as never);
  try {
    await selection.load(); await selection.changeControl(model, 'reasoning_effort', 'high');
    assert.equal(selection.getSnapshot().current?.reasoningEffort, encodeControls({ reasoning_effort: 'high' }));
    assert.equal((calls[0] as any).sessionId, 'session');
    projection = { next: { provider: 'easywork', model: 'from-another-view' } }; project();
    assert.equal(selection.getSnapshot().current?.model, 'from-another-view');
    reject = true; await assert.rejects(selection.select(model), /另一个进程/);
    assert.equal(selection.getSnapshot().current?.model, 'from-another-view'); assert.equal(selection.getSnapshot().busy, false);
  } finally { selection.dispose(); }
});

test('selecting a model starts with visible thoughts and subsequent edits retain a manual hide choice', async () => {
  const row = { ...model, reasoningControls: [
    { path: 'generationConfig.thinkingConfig.includeThoughts', values: [false, true], default: false },
    { path: 'generationConfig.thinkingConfig.thinkingLevel', values: ['medium', 'high'], default: 'medium' },
  ] };
  const calls: Record<string, unknown>[] = [];
  const sessions = {
    binding: () => ({ session: { projections: { faceOf: () => ({ getSnapshot: () => null, subscribe: () => () => {} }) } } }),
    subagentAddress: () => undefined,
  };
  const ctx = { remote: { session: {
    selectModel: async (request: Record<string, unknown>) => { calls.push(request); return { ok: true, value: { selected: request } }; },
  } } };
  const selection = new SessionModels(ctx as never, 'session' as never, {} as never, sessions as never);
  try {
    await selection.select(row);
    assert.equal(calls[0].reasoningEffort, encodeControls({
      'generationConfig.thinkingConfig.includeThoughts': true, 'generationConfig.thinkingConfig.thinkingLevel': 'medium',
    }));
    await selection.changeControl(row, 'generationConfig.thinkingConfig.includeThoughts', false);
    await selection.changeControl(row, 'generationConfig.thinkingConfig.thinkingLevel', 'high');
    assert.equal(selection.getSnapshot().current?.reasoningEffort, encodeControls({
      'generationConfig.thinkingConfig.includeThoughts': false, 'generationConfig.thinkingConfig.thinkingLevel': 'high',
    }));
  } finally { selection.dispose(); }
});
