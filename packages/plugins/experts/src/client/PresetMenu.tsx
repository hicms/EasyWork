import * as React from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { ExpertManagementClient } from './management.js';
import { isNativePreset, nativePresetRows, requireNativePreset } from './preset-policy.js';
import { resolveExpertSeat } from './expert-seat.js';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';

/** A summoned expert is already bound; this surface names it without offering a preset swap. */
function SummonedExpertSeat({ name }: { name: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: 'inherit', color: 'inherit' }} title={name}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="6" r="3"/><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M10 9 6.5 14M14 9l3.5 5M8 17h8"/></svg>
    {name}
  </span>;
}

/** Recover a stale default only after the Host confirms this is an unbound seat. */
function ExpertPresetSeat(props: {
  management: ExpertManagementClient;
  rootSessionId?: string;
  current: string;
  select: (id: string) => Promise<string | undefined>;
  useAgentPresetSeat: (selector: (state: { options: readonly { id: string; isDefault?: boolean }[] }) => string) => string;
}) {
  const [result, setResult] = React.useState<{ name?: string; error?: string }>({});
  const fallback = props.useAgentPresetSeat(state => state.options.find(row => row.isDefault && isNativePreset(row.id))?.id ?? 'standard');
  const latest = React.useRef(props);
  latest.current = props;
  React.useEffect(() => {
    const controller = new AbortController();
    setResult({});
    void (async () => {
      const name = await resolveExpertSeat(props.management, props.rootSessionId, props.current, controller.signal);
      controller.signal.throwIfAborted();
      if (name) { setResult({ name }); return; }
      // The official seat owns staging and the blank-session-only selection check.
      // Do not repaint a false standard label while its selection is still pending.
      const error = await latest.current.select(fallback);
      if (typeof error === 'string' && error) throw new Error(error);
    })().catch(cause => {
      if (!controller.signal.aborted) setResult({ error: cause instanceof Error ? cause.message : '无法确认会话配置，请新建对话。' });
    });
    return () => controller.abort();
  }, [props.management, props.rootSessionId, props.current, fallback]);
  if (result.name) return <SummonedExpertSeat name={result.name}/>;
  return <span role={result.error ? 'alert' : 'status'}>{result.error ?? '正在确认会话配置…'}</span>;
}

/** Keep the native mount loader stable while always invoking the latest injected callback. */
function StableNativePresetSeat(props: any) {
  const { Native, ...seatProps } = props;
  const loadRef = React.useRef(props.load);
  loadRef.current = props.load;
  const load = React.useCallback(() => loadRef.current(), []);
  return <Native {...seatProps} load={load}/>;
}

/**
 * Native controllers stay owned by Harness; expert execution uses the binding-aware summon path.
 *
 * Only the new-session control is wrapped: `conversation.hero.agentPreset` is a single-seat
 * slot, so a later registration takes the seat over. `settings.section` is an additive list
 * slot (every registration is its own page with no replacement semantics), so wrapping it
 * only produced a duplicate "Agent 预设" page next to the Harness-owned one. The settings
 * page stays the Harness owner's; expert presets remain guarded by the Host-side preset
 * checks, not by a second client page.
 */
export function installExpertPresetMenu(ctx: Context, management: ExpertManagementClient): void {
  const install = (key: string) => {
    let dispose: (() => void) | undefined;
    const ready = () => {
      if (dispose) return;
      const original = ctx.slots.entriesOfSlot(key as any).find((entry: any) => !!entry.inject);
      if (!original?.inject) return;
      const Native = original.component as React.ComponentType<any>;
      const projected = new WeakMap<object, any>();
      const project = (state: any, field: 'options') => {
        let value = projected.get(state);
        if (!value) { value = { ...state, [field]: nativePresetRows(state[field]) }; projected.set(state, value); }
        return value;
      };
      function PublicPresets(props: any) {
        const current = props.useAgentPresetSeat((state: any) => state.current);
        if (current && !isNativePreset(current)) {
          const sessions = ctx.sessions as unknown as ISessions;
          const rootSessionId = props.sessionId ? String(sessions.subagentAddress(props.sessionId)?.parentSessionId ?? props.sessionId) : undefined;
          return <ExpertPresetSeat key={`${props.sessionId ?? ''}:${current}`} {...props} current={current} rootSessionId={rootSessionId} management={management}/>;
        }
        const useSeat = (selector: (state: any) => unknown) => props.useAgentPresetSeat((state: any) => selector(project(state, 'options')));
        return <StableNativePresetSeat Native={Native} {...props} useAgentPresetSeat={useSeat} select={async (id: string) => { requireNativePreset(id); return props.select(id); }} />;
      }
      dispose = ctx.slots.register({ name: key, priority: -10, locale: 'settings.agentPreset', inject: original.inject } as any, PublicPresets);
    };
    ctx.effect(() => { const stop = ctx.slots.subscribe(key as any, ready); ready(); return () => { stop(); dispose?.(); }; }, 'easywork.expert-preset-menu.seat');
  };
  install('conversation.hero.agentPreset');
}
