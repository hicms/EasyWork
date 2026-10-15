export const serviceOrigin = 'https://ask.vigoai.cn';
export const providerId = 'easywork';
export const managementPath = '/api/easywork-models';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type ChatProtocol = 'openai-completions' | 'anthropic-messages' | 'gemini-generate-content';
export interface ReasoningControl { readonly path: string; readonly values: readonly Json[]; readonly default: Json; }
export interface ServiceModel {
  readonly id: string; readonly name: string; readonly protocol: ChatProtocol;
  readonly isDefault: boolean; readonly supportsTools: boolean; readonly supportsReasoning: boolean;
  readonly supportsImages: boolean; readonly contextWindow: number | null;
  readonly vendor: string | null; readonly tier: string | null; readonly priceMultiplier: number | null;
  readonly reasoningControls: readonly ReasoningControl[] | null;
}
export interface AccountView { readonly id: string; readonly email: string; }
export interface ModelsSnapshot {
  readonly origin: string; readonly user: AccountView | null; readonly expiresAt: number | null;
  readonly models: readonly ServiceModel[]; readonly error: string | null;
}
export interface Selection { readonly provider: string; readonly model: string; readonly reasoningEffort?: string; }
export const tierLabels: Readonly<Record<string, string>> = { flagship: '旗舰', balanced: '均衡', fast: '快速' };
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function controlLabel(path: string): string {
  const labels: Record<string, string> = {
    reasoning_effort: '推理强度', 'output_config.effort': '推理强度', 'thinking.type': '思考模式',
    'thinking.display': '思考内容', enable_thinking: '启用思考', preserve_thinking: '保留思考',
    'thinking.clear_thinking': '清除历史思考', reasoning_split: '分离思考内容',
    'generationConfig.thinkingConfig.thinkingLevel': '推理强度',
    'generationConfig.thinkingConfig.includeThoughts': '显示思考摘要',
  };
  return labels[path] ?? path;
}
export function valueLabel(value: Json): string {
  return typeof value === 'boolean' ? value ? '开启' : '关闭' : typeof value === 'string' ? value : JSON.stringify(value);
}
