import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelsAccount } from '../src/account.ts';
import { reconcileDefaultModel } from '../src/defaults.ts';
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
