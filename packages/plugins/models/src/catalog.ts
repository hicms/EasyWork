import { record, type ServiceModel, type Json, type ReasoningControl } from './shared.ts';

const protocols = new Set(['openai-completions', 'anthropic-messages', 'gemini-generate-content']);
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
function fail(): never { throw new Error('模型服务返回了无效的模型目录。'); }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= 256; }
function json(value: unknown, depth = 0): value is Json {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 32 && value.every(item => json(item, depth + 1));
  return record(value) && Object.keys(value).length <= 32 && Object.entries(value).every(([key, item]) => !forbidden.has(key) && json(item, depth + 1));
}
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
function controls(value: unknown): readonly ReasoningControl[] | null {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length > 6) fail();
  const seen = new Set<string>(); let combinations = 1;
  return value.map(item => {
    if (!record(item) || !text(item.path) || !/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(item.path)
      || item.path.split('.').some(part => forbidden.has(part)) || seen.has(item.path)
      || !Array.isArray(item.values) || !item.values.length || item.values.length > 16
      || !item.values.every(value => json(value)) || !json(item.default)
      || !item.values.some(value => equal(value, item.default))) fail();
    seen.add(item.path); combinations *= item.values.length;
    if (combinations > 256 || new Set(item.values.map(value => JSON.stringify(value))).size !== item.values.length) fail();
    return { path: item.path, values: item.values as Json[], default: item.default };
  });
}
export function parseCatalog(value: unknown): readonly ServiceModel[] {
  if (!Array.isArray(value) || value.length > 1000) fail();
  const ids = new Set<string>(); const models: ServiceModel[] = [];
  for (const item of value) {
    if (!record(item)) fail();
    if (item.kind !== 'chat') continue;
    if (!text(item.id) || item.id === '.' || item.id === '..' || !text(item.name) || ids.has(item.id)
      || typeof item.protocol !== 'string' || !protocols.has(item.protocol)) fail();
    for (const field of ['isDefault', 'supportsTools', 'supportsReasoning', 'supportsImages']) if (typeof item[field] !== 'boolean') fail();
    if (item.contextWindow != null && (!Number.isSafeInteger(item.contextWindow) || Number(item.contextWindow) <= 0)) fail();
    for (const field of ['vendor', 'tier']) if (item[field] != null && !text(item[field])) fail();
    if (item.priceMultiplier != null && (typeof item.priceMultiplier !== 'number' || !Number.isFinite(item.priceMultiplier) || item.priceMultiplier <= 0)) fail();
    ids.add(item.id);
    models.push({ id: item.id, name: item.name, protocol: item.protocol as ServiceModel['protocol'],
      isDefault: item.isDefault as boolean, supportsTools: item.supportsTools as boolean,
      supportsReasoning: item.supportsReasoning as boolean, supportsImages: item.supportsImages as boolean,
      contextWindow: item.contextWindow as number | null ?? null, vendor: item.vendor as string | null ?? null,
      tier: item.tier as string | null ?? null, priceMultiplier: item.priceMultiplier as number | null ?? null,
      reasoningControls: controls(item.reasoningControls) });
  }
  return models;
}
export function encodeControls(values: Readonly<Record<string, Json>>): string {
  return 'controls:' + JSON.stringify(Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))));
}
function preferredDefault(control: ReasoningControl): Json {
  const { path, values, default: upstream } = control;
  const thinkingType = path === 'thinking.type' || path === 'thinking';
  const current = thinkingType && record(upstream) ? upstream.type : upstream;
  let preferences: readonly Json[] = [];
  if (['generationConfig.thinkingConfig.includeThoughts', 'enable_thinking', 'reasoning_split'].includes(path)) preferences = [true];
  else if (path === 'thinking.display') preferences = ['summarized'];
  else if (thinkingType && current === 'disabled') preferences = ['adaptive', 'enabled'];
  else if (['reasoning_effort', 'generationConfig.thinkingConfig.thinkingLevel'].includes(path)
    && typeof current === 'string' && ['none', 'off', 'minimal'].includes(current.toLowerCase())) {
    preferences = ['low', 'medium', 'high', 'xhigh', 'max'];
  }
  for (const preferred of preferences) {
    const offered = values.find(value => {
      const candidate = thinkingType && record(value) ? value.type : value;
      return typeof candidate === 'string' && typeof preferred === 'string'
        ? candidate.toLowerCase() === preferred : equal(candidate, preferred);
    });
    if (offered !== undefined) return offered;
  }
  return upstream;
}
export function defaultControls(model: ServiceModel): Record<string, Json> {
  // Product defaults use offered values; saved selections still round-trip unchanged.
  return Object.fromEntries((model.reasoningControls ?? []).map(control => [control.path, preferredDefault(control)]));
}
export function controlOptions(model: ServiceModel): readonly { id: string; values: Readonly<Record<string, Json>> }[] {
  if (!model.reasoningControls?.length) return [];
  let options: Record<string, Json>[] = [{}];
  for (const control of model.reasoningControls) options = options.flatMap(option => control.values.map(value => ({ ...option, [control.path]: value })));
  return options.map(values => ({ id: encodeControls(values), values }));
}
export function selectedControls(model: ServiceModel, effort?: string): Readonly<Record<string, Json>> {
  if (effort === undefined) return defaultControls(model);
  const selected = controlOptions(model).find(option => option.id === effort);
  if (!selected) throw new Error('该模型不支持已选的思考参数，请重新选择模型。');
  return selected.values;
}
export function applyControls(payload: unknown, model: ServiceModel, values: Readonly<Record<string, Json>>): unknown {
  if (!record(payload)) throw new Error('模型请求格式无效。');
  // SDK payloads can carry AbortSignal and other live objects outside the edited paths.
  const result = { ...payload };
  for (const [path, value] of Object.entries(values)) {
    // Google's public payload hook sees SDK params; config becomes generationConfig on the wire.
    const parts = (model.protocol === 'gemini-generate-content' ? path.replace(/^generationConfig\./, 'config.') : path).split('.');
    let owner: Record<string, unknown> = result;
    for (const part of parts.slice(0, -1)) { owner[part] = record(owner[part]) ? { ...owner[part] } : {}; owner = owner[part] as Record<string, unknown>; }
    owner[parts.at(-1)!] = structuredClone(value);
  }
  return result;
}
