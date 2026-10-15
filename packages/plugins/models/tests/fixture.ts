import { AskClient } from '../src/ask-client.ts';
import { ModelsAccount, type AccountRecords } from '../src/account.ts';
import type { ServiceModel } from '../src/shared.ts';
export const token = 'test.session.signature';
export const model: ServiceModel = {
  id: 'gateway-model', name: 'Test model', protocol: 'openai-completions', isDefault: true,
  supportsTools: true, supportsImages: true, supportsReasoning: true, contextWindow: 32_768,
  vendor: 'test', tier: 'balanced', priceMultiplier: 1.5,
  reasoningControls: [{ path: 'reasoning_effort', values: ['low', 'high'], default: 'low' }],
};
export function memoryRecords(initial?: unknown): AccountRecords & { value: unknown } {
  let queue = Promise.resolve();
  const store = {
    value: initial,
    async read() { await queue; return store.value; },
    change(mutate: (current: unknown) => unknown) {
      const next = queue.then(() => { const value = mutate(store.value); if (value !== undefined) store.value = value; });
      queue = next.catch(() => {}); return next;
    },
  };
  return store;
}
export function mockService(models: readonly ServiceModel[] = [model]) {
  const records = memoryRecords(); const calls: Request[] = [];
  let meStatus = 200; let modelsStatus = 200; let loginToken = token;
  const fetcher: typeof fetch = async (input, init) => {
    const request = new Request(input, init); calls.push(request);
    switch (new URL(request.url).pathname) {
      case '/api/auth/login': return Response.json({ token: loginToken, expiresAt: Date.now() + 30 * 86_400_000, user: { id: 'user', email: 'test@example.com' } });
      case '/api/auth/me': return Response.json({ id: 'user', email: 'test@example.com' }, { status: meStatus });
      case '/api/models': return Response.json(models.map(row => ({ kind: 'chat', ...row })), { status: modelsStatus });
      case '/api/auth/logout': return new Response(null, { status: 204 });
      default: throw new Error('Unexpected service request: ' + request.url);
    }
  };
  return { records, calls, fetcher, api: new AskClient(fetcher), setMeStatus: (value: number) => { meStatus = value; },
    setModelsStatus: (value: number) => { modelsStatus = value; }, setToken: (value: string) => { loginToken = value; } };
}
export async function loggedIn(models: readonly ServiceModel[] = [model]) {
  const fixture = mockService(models); const account = new ModelsAccount(fixture.records, fixture.api);
  await account.login('test@example.com', 'test password');
  return { ...fixture, account };
}
