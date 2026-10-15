import assert from 'node:assert/strict';
import { test } from 'node:test';
import { controlOptions, defaultControls, encodeControls, selectedControls } from '../src/catalog.ts';
import { model } from './fixture.ts';
import type { ServiceModel } from '../src/shared.ts';

const gemini: ServiceModel = { ...model, protocol: 'gemini-generate-content', reasoningControls: [
  { path: 'generationConfig.thinkingConfig.thinkingLevel', values: ['low', 'medium', 'high'], default: 'medium' },
  { path: 'generationConfig.thinkingConfig.includeThoughts', values: [false, true], default: false },
] };
const claude: ServiceModel = { ...model, protocol: 'anthropic-messages', reasoningControls: [
  { path: 'thinking.type', values: ['adaptive', 'disabled'], default: 'adaptive' },
  { path: 'thinking.display', values: ['omitted', 'summarized'], default: 'omitted' },
  { path: 'output_config.effort', values: ['low', 'high'], default: 'high' },
] };
const minimax: ServiceModel = { ...model, reasoningControls: [
  { path: 'thinking.type', values: ['adaptive', 'disabled'], default: 'adaptive' },
  { path: 'reasoning_split', values: [false, true], default: false },
] };

test('new requests prefer visible thinking without changing upstream metadata or existing effort', () => {
  const before = structuredClone([gemini, claude, minimax]);
  assert.deepEqual(defaultControls(gemini), {
    'generationConfig.thinkingConfig.thinkingLevel': 'medium',
    'generationConfig.thinkingConfig.includeThoughts': true,
  });
  assert.deepEqual(defaultControls(claude), {
    'thinking.type': 'adaptive', 'thinking.display': 'summarized', 'output_config.effort': 'high',
  });
  assert.deepEqual(defaultControls(minimax), { 'thinking.type': 'adaptive', reasoning_split: true });
  assert.deepEqual([gemini, claude, minimax], before);
});

test('disabled defaults use supported thinking switches and the lowest positive effort', () => {
  const row: ServiceModel = { ...model, reasoningControls: [
    { path: 'reasoning_effort', values: ['max', 'high', 'none', 'low'], default: 'none' },
    { path: 'enable_thinking', values: [false, true], default: false },
    { path: 'thinking.type', values: ['disabled', 'enabled', 'adaptive'], default: 'disabled' },
    { path: 'preserve_thinking', values: [false, true], default: false },
    { path: 'thinking.clear_thinking', values: [true, false], default: true },
  ] };
  assert.deepEqual(defaultControls(row), {
    reasoning_effort: 'low', enable_thinking: true, 'thinking.type': 'adaptive',
    preserve_thinking: false, 'thinking.clear_thinking': true,
  });
  const object: ServiceModel = { ...model, reasoningControls: [
    { path: 'thinking', values: [{ type: 'disabled' }, { type: 'enabled', keep: 'all' }], default: { type: 'disabled' } },
  ] };
  assert.deepEqual(defaultControls(object), { thinking: { type: 'enabled', keep: 'all' } });
});

test('Gemini minimal defaults move to a supported thinking level using the original wire value', () => {
  const row: ServiceModel = { ...gemini, reasoningControls: [
    { path: 'generationConfig.thinkingConfig.thinkingLevel', values: ['HIGH', 'MINIMAL', 'LOW'], default: 'MINIMAL' },
  ] };
  assert.deepEqual(defaultControls(row), { 'generationConfig.thinkingConfig.thinkingLevel': 'LOW' });
  assert.deepEqual(selectedControls(row, encodeControls({ 'generationConfig.thinkingConfig.thinkingLevel': 'MINIMAL' })), {
    'generationConfig.thinkingConfig.thinkingLevel': 'MINIMAL',
  });
});

test('unsupported preferences, absent controls and unknown fields keep their declared defaults', () => {
  const row: ServiceModel = { ...model, reasoningControls: [
    { path: 'generationConfig.thinkingConfig.includeThoughts', values: [false], default: false },
    { path: 'thinking.display', values: ['omitted'], default: 'omitted' },
    { path: 'reasoning_effort', values: ['none'], default: 'none' },
    { path: 'future.option', values: [false, true], default: false },
  ] };
  assert.deepEqual(defaultControls(row), {
    'generationConfig.thinkingConfig.includeThoughts': false, 'thinking.display': 'omitted',
    reasoning_effort: 'none', 'future.option': false,
  });
  for (const reasoningControls of [null, []]) assert.deepEqual(defaultControls({ ...model, reasoningControls }), {});
});

test('explicit hidden and disabled selections remain available and take precedence over product defaults', () => {
  for (const row of [gemini, claude, minimax]) {
    const options = controlOptions(row);
    const hidden = Object.fromEntries(row.reasoningControls!.map(control => [control.path,
      control.path === 'thinking.type' ? 'disabled' : control.default]));
    assert.deepEqual(selectedControls(row, encodeControls(hidden)), hidden);
    assert.ok(options.some(option => option.id === encodeControls(hidden)));
    assert.deepEqual(controlOptions(row), options);
  }
});
