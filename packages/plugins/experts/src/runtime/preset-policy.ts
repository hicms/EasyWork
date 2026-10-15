import { type Context, symbols } from '@deepseek-ai/cordis';
import type { AgentPresetRegistry } from '@deepseek-ai/dsh-agent-preset-registry';
import type {} from '@deepseek-ai/cordis-plugin-loader';
import { nativeDefaultPreset, nativePresetRows, requireNativePreset } from '../domain/preset-policy.js';

/** Keep the official registry and Settings owner; constrain only its public choices. */
export function registerExpertPresetPolicy(ctx: Context): void {
  // Install on the shared service, not a caller-specific Cordis shadow.
  const registry = (Reflect.get(ctx.agentPresets, symbols.original) ?? ctx.agentPresets) as AgentPresetRegistry;
  const owner = (Reflect.get(registry, 'ctx') as Context).fiber;
  ctx.effect(() => {
    const keys = ['defaultId', 'remoteExportList', 'select'] as const;
    const previous = keys.map(key => Object.getOwnPropertyDescriptor(registry, key));
    const list = registry.remoteExportList;
    const select = registry.select;
    Object.defineProperties(registry, {
      defaultId: { configurable: true, get(this: AgentPresetRegistry) {
        return nativeDefaultPreset(this.config.selectedDefault.get(), this.config.default);
      } },
      remoteExportList: { configurable: true, writable: true, value: async function (this: AgentPresetRegistry) {
        const roster = await list.call(this);
        return { ...roster, presets: nativePresetRows(roster.presets) };
      } },
      select: { configurable: true, writable: true, value: function (this: AgentPresetRegistry, ...args: Parameters<AgentPresetRegistry['select']>) {
        requireNativePreset(args[1]);
        return select.apply(this, args);
      } },
    });
    const installed = keys.map(key => Object.getOwnPropertyDescriptor(registry, key));
    return () => keys.forEach((key, index) => {
      const current = Object.getOwnPropertyDescriptor(registry, key);
      if (current?.get !== installed[index]?.get || current?.value !== installed[index]?.value) return;
      const descriptor = previous[index];
      if (descriptor) Object.defineProperty(registry, key, descriptor);
      else Reflect.deleteProperty(registry, key);
    });
  }, 'easywork.experts.public-presets');

  // ConfigEditor runs this hook before persisting Settings edits. Checking the
  // resolved config also covers expressions and Loader's volatile updates.
  ctx.on('internal/config', function (_raw, next) {
    const config = next();
    if (this === owner) {
      if (typeof config?.selectedDefault === 'string') requireNativePreset(config.selectedDefault);
      if (typeof config?.default === 'string') requireNativePreset(config.default);
    }
    return config;
  }, { global: true });
}
