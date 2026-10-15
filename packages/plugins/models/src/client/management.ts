import { managementPath, serviceOrigin, type ModelsSnapshot } from '../shared.ts';

export interface ClientState { readonly snapshot: ModelsSnapshot; readonly busy: boolean; readonly ready: boolean; readonly error: string | null; }
export class ModelsClient {
  private readonly lifetime: AbortSignal;
  private state: ClientState = { snapshot: { origin: serviceOrigin, user: null, expiresAt: null, models: [], error: null }, busy: false, ready: false, error: null };
  private generation = 0;
  private listeners = new Set<() => void>();
  constructor(lifetime: AbortSignal) { this.lifetime = lifetime; }
  readonly getSnapshot = (): ClientState => this.state;
  readonly subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private publish(state: ClientState): void { this.state = state; for (const listener of this.listeners) listener(); }
  private async invoke(endpoint: string, payload: unknown = {}): Promise<void> {
    const generation = ++this.generation;
    this.publish({ ...this.state, busy: true, error: null });
    try {
      const response = await fetch(managementPath, { method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }),
        signal: AbortSignal.any([this.lifetime, AbortSignal.timeout(35_000)]) });
      const result = await response.json() as { ok: boolean; value?: ModelsSnapshot; error?: { message?: string } };
      if (!result.ok || !result.value) throw new Error(result.error?.message ?? '模型服务操作失败，请重试。');
      if (generation === this.generation && !this.lifetime.aborted) this.publish({ snapshot: result.value, ready: true, busy: false, error: null });
    } catch (error) {
      if (generation === this.generation && !this.lifetime.aborted) this.publish({ ...this.state, ready: true, busy: false, error: error instanceof Error ? error.message : '模型服务操作失败，请重试。' });
      throw error;
    }
  }
  async refresh(force = false): Promise<void> { if (!this.state.busy) await this.invoke(force ? 'refresh' : 'state'); }
  login(email: string, password: string): Promise<void> { return this.invoke('login', { email, password }); }
  logout(): Promise<void> { return this.invoke('logout'); }
  reset(): void { this.generation++; this.publish({ ...this.state, busy: false, ready: false, snapshot: { origin: serviceOrigin, user: null, expiresAt: null, models: [], error: null }, error: null }); }
}
