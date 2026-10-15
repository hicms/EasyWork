import type { AgentDefaultModelConfig } from '@deepseek-ai/dsh-agent-default-model';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { defaultControls, encodeControls, selectedControls } from './catalog.ts';
import { providerId, type ServiceModel } from './shared.ts';

export async function reconcileDefaultModel(defaults: Pick<AgentDefaultModelConfig, 'currentSelection' | 'saveSelection'>, models: readonly ServiceModel[]): Promise<void> {
  if (!models.length) return;
  const current = defaults.currentSelection();
  const existing = current.provider === providerId ? models.find(model => model.id === current.model) : undefined;
  if (existing) {
    try { selectedControls(existing, current.reasoningEffort); return; }
    catch { /* The service removed a saved reasoning value; repair only the global default. */ }
  }
  const model = existing ?? models.find(model => model.isDefault) ?? models[0];
  await defaults.saveSelection({ provider: providerId, model: model.id,
    ...(model.reasoningControls?.length ? { reasoningEffort: ReasoningEffortId(encodeControls(defaultControls(model))) } : {}) });
}
