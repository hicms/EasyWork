import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { ModelAdapter } from '../src/model-adapter.ts';
import { encodeControls } from '../src/catalog.ts';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import { BlockAssembler, createToolResultMessage } from '@deepseek-ai/dsh-llm';
import { loggedIn, model, token } from './fixture.ts';
import type { ServiceModel } from '../src/shared.ts';

function sse(events: unknown[], names?: string[]): Response {
  return new Response(events.map((event, index) => (names ? 'event: ' + names[index] + '\n' : '') + 'data: ' + JSON.stringify(event) + '\n\n').join('') + (names ? '' : 'data: [DONE]\n\n'), { headers: { 'content-type': 'text/event-stream' } });
}
const openai = () => sse([
  { id: 'reply', object: 'chat.completion.chunk', created: 1, model: model.id, choices: [{ index: 0, delta: { role: 'assistant', content: 'OK' }, finish_reason: null }] },
  { id: 'reply', object: 'chat.completion.chunk', created: 1, model: model.id, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  { id: 'reply', object: 'chat.completion.chunk', created: 1, model: model.id, choices: [], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } },
]);
function anthropic(): Response { return sse([
  { type: 'message_start', message: { id: 'msg', type: 'message', role: 'assistant', model: model.id, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 3, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } },
  { type: 'message_stop' },
], ['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']); }
function request(id: string, reasoningEffort?: string): GenerateOptions {
  return { provider: 'easywork', model: id, messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }], ...(reasoningEffort ? { reasoningEffort } : {}) } as GenerateOptions;
}
async function collect(adapter: ModelAdapter, options: GenerateOptions): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []; for await (const chunk of adapter.stream(options)) chunks.push(chunk); return chunks;
}
for (const protocol of ['openai-completions', 'anthropic-messages', 'gemini-generate-content'] as const) {
  test(`ModelAdapter routes ${protocol}, JWT, controls and stream conversion through the official adapter`, async t => {
    const row: ServiceModel = { ...model, protocol, reasoningControls: protocol === 'gemini-generate-content'
      ? [{ path: 'generationConfig.thinkingConfig.includeThoughts', values: [false, true], default: true }]
      : protocol === 'anthropic-messages' ? [{ path: 'thinking.type', values: ['adaptive', 'disabled'], default: 'adaptive' }] : model.reasoningControls };
    const fixture = await loggedIn([row]); t.after(() => fixture.account.dispose());
    let observed: { path: string; headers: Headers; body: Record<string, any> } | undefined;
    const transport = mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const outgoing = new Request(input, init); observed = { path: new URL(outgoing.url).pathname, headers: outgoing.headers, body: await outgoing.json() };
      if (protocol === 'anthropic-messages') return anthropic();
      if (protocol === 'gemini-generate-content') return new Response('data: ' + JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'OK' }] }, finishReason: 'STOP', index: 0 }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1, totalTokenCount: 4 } }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } });
      return openai();
    }); t.after(() => transport.mock.restore());
    const adapter = new ModelAdapter(fixture.account);
    const effort = protocol === 'openai-completions' ? encodeControls({ reasoning_effort: 'high' }) : undefined;
    const chunks = await collect(adapter, request(row.id, effort));
    assert.ok(observed, JSON.stringify(chunks));
    assert.equal(observed.path, '/api/llm/' + row.id + (protocol === 'openai-completions' ? '/chat/completions' : protocol === 'anthropic-messages' ? '/v1/messages' : '/v1beta/models/' + row.id + ':streamGenerateContent'));
    assert.equal(observed.headers.get('authorization'), 'Bearer ' + token);
    if (protocol === 'openai-completions') assert.equal(observed.body.reasoning_effort, 'high');
    else if (protocol === 'anthropic-messages') { assert.equal(observed.headers.get('x-api-key'), token); assert.equal(observed.body.thinking.type, 'adaptive'); }
    else { assert.equal(observed.headers.get('x-goog-api-key'), token); assert.equal(observed.body.generationConfig.thinkingConfig.includeThoughts, true); }
    assert.ok(chunks.some(chunk => chunk.type === 'text-delta' || chunk.type === 'block-delta'), JSON.stringify(chunks));
    assert.equal(chunks.at(-1)?.type, 'finish');
    assert.ok(chunks.some(chunk => chunk.type === 'usage'));
    assert.equal(chunks.findIndex(chunk => chunk.type === 'usage') < chunks.findIndex(chunk => chunk.type === 'finish'), true);
    if (chunks.at(-1)?.type === 'finish') assert.equal((chunks.at(-1) as Extract<StreamChunk, { type: 'finish' }>).reason.kind, 'stop', JSON.stringify(chunks));
  });
}

test('official tool-call assembly, tool-result continuation and replay survive the owned adapter', async t => {
  const fixture = await loggedIn(); t.after(() => fixture.account.dispose()); let round = 0;
  const requests: Record<string, any>[] = [];
  const transport = mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const outgoing = new Request(input, init); requests.push(await outgoing.json());
    if (round++ > 0) return openai();
    return sse([
      { id: 'reply', object: 'chat.completion.chunk', created: 1, model: model.id, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'sum', arguments: '{"a":1' } }] }, finish_reason: null }] },
      { id: 'reply', object: 'chat.completion.chunk', created: 1, model: model.id, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '}' } }] }, finish_reason: null }] },
      { id: 'reply', object: 'chat.completion.chunk', created: 1, model: model.id, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } },
    ]);
  }); t.after(() => transport.mock.restore());
  const adapter = new ModelAdapter(fixture.account);
  const options = { ...request(model.id), tools: [{ name: 'sum', description: 'Sum', parameters: { type: 'object', properties: { a: { type: 'number' } }, required: ['a'] } }] } as GenerateOptions;
  const chunks = await collect(adapter, options); const assembled = new BlockAssembler(); for (const chunk of chunks) assembled.push(chunk);
  assert.equal(assembled.finish.kind, 'tool-calls');
  const call = assembled.blocks().find(block => block.type === 'tool-call'); assert.ok(call && call.type === 'tool-call');
  assert.equal(call.name, 'sum'); assert.equal(call.arguments, '{"a":1}');
  assert.ok(assembled.replayState, 'official native replay envelope is preserved');
  const assistant = assembled.message({ provider: 'easywork', model: model.id });
  await collect(adapter, { ...options, messages: [...options.messages, assistant, createToolResultMessage({ callId: call.id, content: [{ type: 'text', text: '2' }], isError: false })] });
  assert.equal(requests[0].tools[0].function.name, 'sum');
  assert.equal(requests[1].messages.at(-1).role, 'tool'); assert.equal(requests[1].messages.at(-1).tool_call_id, 'call-1');
  assert.equal(requests[1].messages.at(-1).content, '2');
});

test('image input uses the official attachment request variant without reading user paths', async t => {
  const fixture = await loggedIn(); t.after(() => fixture.account.dispose());
  const bytes = new Uint8Array([1, 2, 3]); let reads = 0; let payload: Record<string, any> | undefined;
  const transport = mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    payload = await new Request(input, init).json(); return openai();
  }); t.after(() => transport.mock.restore());
  const image = { attachmentId: 'image-id', mediaType: 'image/png', bytes: 3, width: 1, height: 1 };
  const adapter = new ModelAdapter(fixture.account, {
    resolveAttachments: () => ({ readImageRequest: async () => { reads++; return { attachment: image, variantId: 'variant', data: bytes, bytes: 3, mediaType: 'image/png', width: 1, height: 1, depth: 'uchar', space: 'srgb', hasAlpha: false }; } }) as never,
    resolveImageAccess: () => ({ readonlyPath: '/attachments/image.png' }),
  });
  await collect(adapter, { ...request(model.id), messages: [{ role: 'user', content: [{ type: 'image', attachment: image }] }] } as GenerateOptions);
  assert.equal(reads, 1); assert.ok(payload);
  assert.ok(payload.messages[0].content.some((part: Record<string, any>) => part.type === 'image_url' && part.image_url.url === 'data:image/png;base64,AQID'));
});
test('prepared model calls cannot dispatch after account logout; unsupported controls fail before transport', async t => {
  const fixture = await loggedIn(); t.after(() => fixture.account.dispose());
  const adapter = new ModelAdapter(fixture.account); const prepared = await adapter.prepareCall('easywork', model.id);
  const fetcher = mock.method(globalThis, 'fetch', async () => { throw new Error('must not request'); }); t.after(() => fetcher.mock.restore());
  await assert.rejects(collect(adapter, request(model.id, 'bad-control')), /不支持/);
  await fixture.account.logout();
  await assert.rejects(async () => { for await (const _chunk of prepared.stream(request(model.id))) {} }, /变更|登录/);
  assert.equal(fetcher.mock.callCount(), 0);
});

for (const protocol of ['openai-completions', 'anthropic-messages', 'gemini-generate-content'] as const) {
  test(`${protocol} error bodies cannot reflect the account JWT into the terminal failure`, async t => {
    const fixture = await loggedIn([{ ...model, protocol }]); t.after(() => fixture.account.dispose());
    const reflected = 'Invalid request using ' + token;
    const fetcher = mock.method(globalThis, 'fetch', async () => Response.json(protocol === 'gemini-generate-content'
      ? { error: { code: 400, status: 'INVALID_ARGUMENT', message: reflected } }
      : protocol === 'anthropic-messages' ? { type: 'error', error: { type: 'invalid_request_error', message: reflected } }
      : { error: { type: 'invalid_request_error', message: reflected } }, { status: 400 }));
    t.after(() => fetcher.mock.restore());
    const chunks = await collect(new ModelAdapter(fixture.account), request(model.id));
    assert.equal(JSON.stringify(chunks).includes(token), false);
    assert.equal(chunks.at(-1)?.type, 'finish');
    assert.ok(JSON.stringify(chunks).includes('[redacted]'));
  });
  test(`${protocol} service 401 invalidates this account before the next request`, async t => {
    const fixture = await loggedIn([{ ...model, protocol }]); t.after(() => fixture.account.dispose());
    const fetcher = mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 401, message: 'Unauthorized', status: 'UNAUTHENTICATED' } }, { status: 401 }));
    t.after(() => fetcher.mock.restore());
    const chunks = await collect(new ModelAdapter(fixture.account), request(model.id));
    assert.equal(chunks.at(-1)?.type, 'finish');
    assert.equal(fixture.account.view().user, null, JSON.stringify(chunks));
    assert.equal(JSON.stringify(fixture.records.value).includes(token), false);
  });
}
