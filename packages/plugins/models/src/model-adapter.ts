import { LlmAdapter, LlmError, ReasoningEffortId, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import type { PiAiAdapterOptions, ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai';
import { createProvider, InMemoryCredentialStore, lazyApi } from '@earendil-works/pi-ai';
import type { Api, Model, ProviderStreams } from '@earendil-works/pi-ai';
import { ModelsAccount, type ModelBinding } from './account.ts';
import { applyControls, controlOptions, defaultControls, encodeControls, selectedControls } from './catalog.ts';
import { providerId, serviceOrigin, valueLabel, type ServiceModel } from './shared.ts';

const retryPolicy = resolveRetryPolicy(undefined, 'easywork-models');
const defaultMaxOutputTokens = 32_768;
const apis: Record<ServiceModel['protocol'], ProviderStreams> = {
  'openai-completions': lazyApi(() => import('@earendil-works/pi-ai/api/openai-completions')),
  'anthropic-messages': lazyApi(() => import('@earendil-works/pi-ai/api/anthropic-messages')),
  'gemini-generate-content': lazyApi(() => import('@earendil-works/pi-ai/api/google-generative-ai')),
};
function modelInfo(model: ServiceModel): LlmResolvedModelInfo {
  const efforts = controlOptions(model);
  return { provider: providerId, id: model.id, name: model.name,
    inputModalities: model.supportsImages ? ['text', 'image'] : ['text'],
    ...(model.contextWindow ? { context: { contextWindow: model.contextWindow } } : {}),
    ...(efforts.length ? { reasoning: {
      efforts: efforts.map(option => ({ id: ReasoningEffortId(option.id), name: Object.values(option.values).map(valueLabel).join(' · ') })),
      defaultEffort: ReasoningEffortId(encodeControls(defaultControls(model))),
    } } : {}),
  };
}
export class ModelAdapter extends LlmAdapter {
  private readonly account: ModelsAccount;
  private readonly attachments: Pick<PiAiAdapterOptions, 'resolveAttachments' | 'resolveImageAccess'>;
  constructor(account: ModelsAccount, attachments: Pick<PiAiAdapterOptions, 'resolveAttachments' | 'resolveImageAccess'> = {}) {
    super(); this.account = account; this.attachments = attachments;
  }
  providerInfo(provider: string) { return { id: provider, name: 'EasyWork' }; }
  providerRetryPolicy() { return retryPolicy; }
  async listModels(): Promise<readonly LlmModelInfo[]> { return (await this.account.state()).models.map(modelInfo); }
  async resolveModel(_provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> { return modelInfo((await this.account.capture(model, signal)).model); }
  async prepareCall(_provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    signal?.throwIfAborted(); const binding = await this.account.capture(model, signal); signal?.throwIfAborted();
    return { model: modelInfo(binding.model), stream: options => this.dispatch(binding, options) };
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const prepared = await this.prepareCall(options.provider, options.model, options.signal);
    yield* prepared.stream(options);
  }
  private async *dispatch(binding: ModelBinding, options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.provider !== providerId || options.model !== binding.model.id) throw new LlmError('模型请求与已准备的模型不一致。', 'INVALID_PREPARED_CALL');
    await this.account.assertCurrent(binding);
    if (!binding.model.supportsTools && options.tools?.length) throw new LlmError('所选模型不支持工具调用，请选择支持工具的模型。', 'UNSUPPORTED_OPTION');
    const controls = selectedControls(binding.model, options.reasoningEffort);
    const model = binding.model;
    const baseUrl = serviceOrigin + '/api/llm/' + encodeURIComponent(model.id) + (model.protocol === 'gemini-generate-content' ? '/v1beta' : '');
    const piModel: Model<Api> = {
      id: model.id, name: model.name, provider: providerId,
      api: model.protocol === 'gemini-generate-content' ? 'google-generative-ai' : model.protocol,
      baseUrl, reasoning: false, input: model.supportsImages ? ['text', 'image'] : ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.contextWindow ?? 32_768, maxTokens: Math.min(model.contextWindow ?? defaultMaxOutputTokens, defaultMaxOutputTokens),
    };
    const token = binding.grant.token;
    const provider = createProvider({ id: providerId, name: 'EasyWork', models: [piModel],
      auth: { apiKey: { name: 'EasyWork', resolve: async () => ({ auth: { apiKey: token }, source: 'EasyWork account' }) } },
      api: apis[model.protocol],
    });
    const wrapped = { ...provider, streamSimple: (target: Model<Api>, context: Parameters<typeof provider.streamSimple>[1], supplied?: Parameters<typeof provider.streamSimple>[2]) => provider.streamSimple(target, context, {
      ...supplied, onPayload: payload => applyControls(payload, model, controls),
      // Google owns its HTTP transport and exposes no redirect option. Its endpoint is the fixed, trusted service origin.
      ...(model.protocol === 'gemini-generate-content' ? {} : { fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await fetch(input, { ...init, redirect: 'error' });
        if (response.status === 401) await this.account.expire(token);
        return response;
      }) as typeof fetch }),
    }) };
    const profile: ResolvedPiAiProviderProfile = {
      provider: providerId, displayName: 'EasyWork', piProvider: wrapped,
      streamIdleTimeoutMs: 300_000, maxRequestImageBytes: 20 * 1024 * 1024,
      requestImagePixelBudget: 4_194_304, requestImageMaxBytes: 1_048_576,
      retryPolicy, modelErrors: new Map(), configuredMaxTokens: new Map(),
      headers: { authorization: 'Bearer ' + token },
    };
    const profiles = new Map([[providerId, profile]]);
    const delegate = new PiAiAdapter({
      profiles: () => profiles, resolveApiKey: async () => { await this.account.assertCurrent(binding); return token; },
      auth: { credentials: new InMemoryCredentialStore(), authContext: { env: async () => undefined, fileExists: async () => false } },
      ...this.attachments,
    });
    // DSH owns the opaque selection. The library's narrower native reasoning parser never sees it.
    const { reasoningEffort: _effort, ...request } = options;
    try {
      for await (const chunk of delegate.stream({ ...request, signal: AbortSignal.any([binding.signal, ...(options.signal ? [options.signal] : [])]) })) {
        if (chunk.type === 'finish' && (chunk.reason.kind === 'error' || chunk.reason.kind === 'aborted')) {
          // ask-service maps upstream credential failures to 502; AUTH belongs to this account session.
          if (chunk.reason.failure.status === 401 || chunk.reason.failure.code === 'AUTH') await this.account.expire(token);
          yield { ...chunk, reason: { ...chunk.reason, failure: { ...chunk.reason.failure, message: chunk.reason.failure.message.replaceAll(token, '[redacted]') } } };
        } else yield chunk;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes(token)) {
        throw new LlmError(error.message.replaceAll(token, '[redacted]'), error instanceof LlmError ? error.code : 'MODEL_REQUEST_FAILED');
      }
      throw error;
    }
  }
}
