import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const require = createRequire(new URL('../../../packages/providers/browser-session/package.json', import.meta.url));

test('disposing during browser startup waits for the late worker to close', async t => {
  const opened = Promise.withResolvers(), launching = Promise.withResolvers(), closing = Promise.withResolvers();
  let closed = 0;
  t.mock.module(new URL('../../../packages/providers/browser-session/dist/managed-electron.js', import.meta.url).href, {
    namedExports: { launchManagedElectron: async () => { launching.resolve(); return opened.promise; } },
  });
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
  const { apply } = await import('../../../packages/providers/browser-session/dist/index.js');
  const ctx = new Context(), agentContext = new Context();
  const agent = { id: 'shutdown-race', ctx: agentContext, session: { header: {} } };
  ctx.provide('agents', { get: id => id === agent.id ? agent : undefined });
  ctx.provide('browserUse', { register: () => () => {} });
  apply(ctx, { electronExecutable: 'test-owned-worker' });
  const activating = ctx.parallel('agent/created', { agent, signal: new AbortController().signal }).catch(error => error);
  await launching.promise;
  let disposed = false;
  const disposal = ctx.fiber.dispose().then(() => { disposed = true; });
  await new Promise(resolve => setImmediate(resolve));
  opened.resolve({ close: async () => { closed++; await closing.promise; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, 1, 'A worker acquired during shutdown must be released');
  assert.equal(disposed, false, 'Host disposal must await worker cleanup');
  closing.resolve();
  await disposal;
  await activating;
  await agentContext.fiber.dispose();
  assert.equal(closed, 1);
});
