import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client';
import { defaultControls, encodeControls, selectedControls } from '../catalog.ts';
import { providerId, record, type Selection, type ServiceModel, type Json } from '../shared.ts';
import type { ModelsClient } from './management.ts';

export interface SelectionState { readonly current: Selection | null; readonly busy: boolean; readonly error: string | null; }
export class SessionModels {
  private readonly ctx: Context;
  private readonly sessionId: SessionId;
  private readonly account: ModelsClient;
  private readonly sessions: ISessions;
  private readonly source: { getSnapshot(): unknown; subscribe(listener: () => void): () => void };
  private state: SelectionState = { current: null, busy: false, error: null };
  private listeners = new Set<() => void>();
  private generation = 0;
  private disposed = false;
  private fallback: Selection | null = null;
  private readonly unsubscribe: () => void;
  constructor(ctx: Context, sessionId: SessionId, account: ModelsClient, sessions: ISessions) {
    this.ctx = ctx; this.sessionId = sessionId; this.account = account; this.sessions = sessions;
    const binding = sessions.binding(sessionId);
    if (!binding) throw new Error('会话尚未就绪，请重试。');
    this.source = binding.session.projections.faceOf('modelSelection');
    this.unsubscribe = this.source.subscribe(() => this.project()); this.project();
  }
  readonly getSnapshot = (): SelectionState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(state: SelectionState): void { if (this.disposed) return; this.state = state; for (const listener of this.listeners) listener(); }
  private project(): void {
    const value = this.source.getSnapshot();
    const next = record(value) && record(value.next) ? value.next : null;
    const current = next && typeof next.provider === 'string' && typeof next.model === 'string'
      ? { provider: next.provider, model: next.model, ...(typeof next.reasoningEffort === 'string' ? { reasoningEffort: next.reasoningEffort } : {}) } : this.fallback;
    this.publish({ ...this.state, current });
  }
  async load(): Promise<void> {
    const generation = this.generation;
    try {
      await this.account.refresh();
      const catalog = await this.ctx.remote.session.modelCatalog();
      if (this.disposed || generation !== this.generation) return;
      if (!catalog.ok) throw new Error('模型目录暂不可用，请重试。');
      this.fallback = catalog.value.default; this.project();
    } catch (error) { this.publish({ ...this.state, error: error instanceof Error ? error.message : '模型目录暂不可用。' }); }
  }
  async select(model: ServiceModel, values = defaultControls(model)): Promise<void> {
    if (this.sessions.subagentAddress(this.sessionId) !== undefined) throw new Error('子任务使用其原生模型配置。');
    const generation = ++this.generation;
    const next: Selection = { provider: providerId, model: model.id, ...(model.reasoningControls?.length ? { reasoningEffort: encodeControls(values) } : {}) };
    selectedControls(model, next.reasoningEffort);
    this.publish({ ...this.state, busy: true, error: null });
    try {
      const result = await this.ctx.remote.session.selectModel({ sessionId: this.sessionId, ...next });
      if (this.disposed || generation !== this.generation) return;
      if (!result.ok) throw new Error(result.error.code === 'session/writer-held' ? '该会话正由另一个进程使用，请关闭后重试。' : '模型切换失败，请重试。');
      this.publish({ current: result.value.selected, busy: false, error: null });
    } catch (error) {
      if (generation === this.generation) this.publish({ ...this.state, busy: false, error: error instanceof Error ? error.message : '模型切换失败。' });
      throw error;
    }
  }
  async changeControl(model: ServiceModel, path: string, value: Json): Promise<void> {
    const values = selectedControls(model, this.state.current?.reasoningEffort);
    await this.select(model, { ...values, [path]: value });
  }
  reset(): void { this.generation++; this.fallback = null; this.publish({ current: null, busy: false, error: null }); }
  dispose(): void { this.disposed = true; this.generation++; this.unsubscribe(); this.listeners.clear(); }
}
