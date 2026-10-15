/** Compiled expert presets are private compositions, never ordinary preset choices. */
export function isNativePreset(id: string): boolean { return !id.startsWith('wd-exp-'); }

export function nativePresetRows<T extends { id: string }>(rows: readonly T[]): readonly T[] {
  return rows.filter(row => isNativePreset(row.id));
}

export function requireNativePreset(id: string): void {
  if (!isNativePreset(id)) throw new Error('请从专家中心召唤专家；内部专家配置不能作为普通对话或默认配置。');
}

/** Preserve a valid user or deployment default; repair only internal expert defaults. */
export function nativeDefaultPreset(selected: string | undefined, fallback: string): string {
  if (selected && isNativePreset(selected)) return selected;
  return isNativePreset(fallback) ? fallback : 'standard';
}
