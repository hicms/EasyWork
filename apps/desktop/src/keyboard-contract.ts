/** Carrier adapter declarations for the published shortcut protocol. */
export const KEYBOARD_IPC = {
  get: 'easywork:shortcuts-get', edit: 'easywork:shortcuts-edit', recording: 'easywork:shortcuts-recording',
  close: 'easywork:shortcuts-close', input: 'easywork:shortcuts-input', changed: 'easywork:shortcuts-changed',
} as const
export interface NativeBinding { code: string, secondCode?: string, modifiers: readonly string[] }
export interface ShortcutSnapshot { revision: string, sequence: number, status: 'loading' | 'ready' | 'unreadable', document: unknown }
export interface ShortcutCoordinator {
  setDefinitions(definitions: readonly unknown[] | null): void
  readCurrent(): Promise<ShortcutSnapshot>
  edit(edit: unknown, revision: string): Promise<unknown>
  dispose(): void
}
export interface ShortcutProtocol {
  ShortcutPersistence: new (storage: { read(): Promise<string | null>, write(raw: string): Promise<void> },
    runtime: 'desktop', platform: string, reread: boolean, publish: (snapshot: ShortcutSnapshot) => void) => ShortcutCoordinator
  parseShortcutDefinitions(input: unknown): readonly unknown[]
  parseShortcutEdit(input: unknown): unknown
  effectiveShortcuts(definitions: readonly unknown[], document: unknown, runtime: 'desktop', platform: string):
    readonly { binding: NativeBinding | null, issue: string | null, conflicts: readonly string[] }[]
  bindingKey(binding: NativeBinding): string
}
export interface NativeKeyboardInput {
  kind: 'keyboard' | 'iframe', revision: string, frameName: string, code: string, secondCode?: string,
  repeat: boolean, control: boolean, alt: boolean, shift: boolean, meta: boolean,
}
