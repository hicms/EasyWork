import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelsAccount } from '../src/account.ts';
import { reconcileDefaultModel } from '../src/defaults.ts';
import { encodeControls, selectedControls } from '../src/catalog.ts';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { model, mockService } from './fixture.ts';
import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model';

test('login and restart make fresh sessions use the service default, preserving an existing valid preference', async t => {
  let current = { provider: 'deepseek-official', model: 'old-model' } as ReturnType<AgentDefaultModelConfig['currentSelection']>;
  const writes: unknown[] = [];
  const defaults: Pick<AgentDefaultModelConfig, 'currentSelection' | 'saveSelection'> = {
    currentSelection: () => current, saveSelection: async selection => { writes.push(selection); current = selection; },
  };
  const alternate = { ...model, id: 'preferred', isDefault: false };
  const fixture = mockService([model, alternate]);
  const account = new ModelsAccount(fixture.records, fixture.api, models => reconcileDefaultModel(defaults, models)); t.after(() => account.dispose());
  await account.login('test@example.com', 'test password');
  assert.equal(current.provider, 'easywork'); assert.equal(current.model, model.id); assert.equal(writes.length, 1);
  current = { provider: 'easywork', model: alternate.id };
  const restored = new ModelsAccount(fixture.records, fixture.api, models => reconcileDefaultModel(defaults, models)); t.after(() => restored.dispose());
  await restored.state(); assert.equal(current.model, alternate.id); assert.equal(writes.length, 1);
  await restored.logout(); assert.equal(current.model, alternate.id, 'logout retains the official saved selection and local history');
});

test('global defaults request thoughts while existing hidden or implicit choices are preserved', async () => {
  const row = { ...model, reasoningControls: [
    { path: 'generationConfig.thinkingConfig.includeThoughts', values: [false, true], default: false },
  ] };
  let current = { provider: 'official', model: 'old' } as ReturnType<AgentDefaultModelConfig['currentSelection']>;
  let writes = 0;
  const defaults: Pick<AgentDefaultModelConfig, 'currentSelection' | 'saveSelection'> = {
    currentSelection: () => current, saveSelection: async selection => { writes++; current = selection; },
  };
  await reconcileDefaultModel(defaults, [row]);
  assert.equal(current.reasoningEffort, encodeControls({ 'generationConfig.thinkingConfig.includeThoughts': true }));
  assert.equal(writes, 1);

  current = { ...current, reasoningEffort: ReasoningEffortId(encodeControls({ 'generationConfig.thinkingConfig.includeThoughts': false })) };
  await reconcileDefaultModel(defaults, [row]);
  assert.deepEqual(selectedControls(row, current.reasoningEffort), { 'generationConfig.thinkingConfig.includeThoughts': false });
  assert.equal(writes, 1, 'saved hidden choices must not be migrated');

  current = { provider: 'easywork', model: row.id };
  await reconcileDefaultModel(defaults, [row]);
  assert.deepEqual(selectedControls(row, current.reasoningEffort), { 'generationConfig.thinkingConfig.includeThoughts': true });
  assert.equal(writes, 1, 'implicit defaults need no additional configuration write');
});
