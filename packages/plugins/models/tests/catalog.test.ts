import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCatalog, controlOptions, selectedControls, applyControls, encodeControls, defaultControls } from '../src/catalog.ts';
import { model } from './fixture.ts';

test('catalog admits only public chat fields and rejects duplicate ids and unsafe control paths', () => {
  const parsed = parseCatalog([{ ...model, kind: 'chat', apiKey: 'never-copy', baseUrl: 'https://upstream.invalid' }, { kind: 'embedding' }]);
  assert.equal(parsed.length, 1); assert.equal(JSON.stringify(parsed).includes('never-copy'), false);
  assert.throws(() => parseCatalog([{ ...model, kind: 'chat' }, { ...model, kind: 'chat' }]), /无效/);
  assert.throws(() => parseCatalog([{ ...model, kind: 'chat', reasoningControls: [{ path: '__proto__.polluted', values: [true], default: true }] }]), /无效/);
  assert.throws(() => parseCatalog([{ ...model, kind: 'chat', reasoningControls: [{ path: 'thinking.type', values: ['enabled'], default: 'wrong' }] }]), /无效/);
});
test('complete reasoning selections round-trip without changing wire values or mutating the payload', () => {
  const multi = { ...model, reasoningControls: [...model.reasoningControls!, { path: 'thinking.type', values: ['enabled', 'disabled'], default: 'enabled' }] };
  const options = controlOptions(multi); assert.equal(options.length, 4);
  const effort = encodeControls({ 'thinking.type': 'disabled', reasoning_effort: 'high' });
  const values = selectedControls(multi, effort); assert.equal(values.reasoning_effort, 'high');
  const original = { model: 'id', messages: [], thinking: { keep: 'all' } };
  assert.deepEqual(applyControls(original, multi, values), { ...original, reasoning_effort: 'high', thinking: { keep: 'all', type: 'disabled' } });
  assert.deepEqual(original.thinking, { keep: 'all' });
  assert.throws(() => selectedControls(multi, 'unsupported'), /不支持/);
});
test('Gemini reasoning metadata targets the public SDK config and preserves content/tools', () => {
  const gemini = { ...model, protocol: 'gemini-generate-content' as const, reasoningControls: [{ path: 'generationConfig.thinkingConfig.includeThoughts', values: [false, true], default: true }] };
  const signal = new AbortController().signal;
  const result = applyControls({ contents: [], config: { tools: [], abortSignal: signal } }, gemini, defaultControls(gemini));
  assert.deepEqual(result, { contents: [], config: { tools: [], abortSignal: signal, thinkingConfig: { includeThoughts: true } } });
});
