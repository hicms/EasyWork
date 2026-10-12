/** Electron input adapter using preference rules from the single published runtime Profile. */
import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type Input, type WebContents } from 'electron'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP_ORIGIN } from './startup-contract.ts'
import { KEYBOARD_IPC, type NativeBinding, type ShortcutProtocol, type ShortcutSnapshot } from './keyboard-contract.ts'

export async function installKeyboard(profile: string, userData: string, getWindow: () => BrowserWindow | undefined,
  assertSender: (event: IpcMainInvokeEvent) => void) {
  const require = createRequire(join(profile, 'package.json'))
  const protocol: ShortcutProtocol = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-client-shortcuts/protocol')).href)
  const atomic: { writeFileAtomic(path: string, raw: string, options: { mode: number, dirMode: number }): Promise<void> } =
    await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-atomic-write')).href)
  const platform = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux'
  const scopedDesktop = platform === 'macos' || platform === 'windows'
  let definitions: readonly unknown[] = [], revision: string | undefined, recording = false
  let keys = new Set<string>(), editing: WebContents | undefined
  const path = join(userData, 'keybindings.json')
  const publish = (snapshot: ShortcutSnapshot): void => {
    revision = definitions.length && snapshot.status !== 'loading' ? snapshot.revision : undefined
    const rows = snapshot.status === 'loading' ? [] : protocol.effectiveShortcuts(definitions, snapshot.document, 'desktop', platform)
    keys = new Set(rows.flatMap(row => row.binding && row.issue === null && !row.conflicts.length ? [protocol.bindingKey(row.binding)] : []))
    const page = getWindow()
    if (page && !page.isDestroyed() && page.webContents.mainFrame.url.startsWith(APP_ORIGIN + '/')) {
      page.webContents.send(KEYBOARD_IPC.changed, snapshot)
    }
  }
  const persistence = new protocol.ShortcutPersistence({
    read: async () => {
      try { return await readFile(path, 'utf8') }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
    },
    write: raw => atomic.writeFileAtomic(path, raw, { mode: 0o600, dirMode: 0o700 }),
  }, 'desktop', platform, false, publish)
  ipcMain.handle(KEYBOARD_IPC.get, (event, input: unknown) => {
    assertSender(event); definitions = protocol.parseShortcutDefinitions(input)
    persistence.setDefinitions(definitions); return persistence.readCurrent()
  })
  ipcMain.handle(KEYBOARD_IPC.edit, (event, input: unknown, expected: unknown) => {
    assertSender(event)
    if (typeof expected !== 'string') throw new Error('无效的快捷键配置版本')
    return persistence.edit(protocol.parseShortcutEdit(input), expected)
  })
  ipcMain.handle(KEYBOARD_IPC.recording, (event, active: unknown) => {
    assertSender(event)
    if (typeof active !== 'boolean') throw new Error('无效的快捷键录制状态')
    recording = active; getWindow()!.webContents.setIgnoreMenuShortcuts(active)
  })
  ipcMain.handle(KEYBOARD_IPC.close, (event, expected: unknown) => {
    assertSender(event)
    const page = getWindow()!
    if (revision !== undefined && expected === revision && !recording && page.isFocused() && page.isEnabled()) page.close()
  })
  const attach = (page: BrowserWindow): void => {
    const contents = page.webContents
    let deadKey = false, inputRevision: string | undefined, inputFrame: WebContents['focusedFrame'] = null
    const held = new Set<string>(), consumed = new Map<string, 'press' | 'repeat'>()
    const reset = (): void => {
      deadKey = false; held.clear(); consumed.clear(); inputRevision = undefined; inputFrame = null
      if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(recording)
    }
    const beforeInput = (event: Electron.Event, input: Input): void => {
      if (event.defaultPrevented) { reset(); return }
      if (editing === contents) { held.clear(); consumed.clear(); contents.setIgnoreMenuShortcuts(true); return }
      if (page !== getWindow() || !page.isFocused() || !page.isEnabled() || revision === undefined) { reset(); return }
      const modifiers = (['control', 'alt', 'shift', 'meta'] as const).filter(modifier => input[modifier])
      const match = keys.has(protocol.bindingKey({ code: input.code, modifiers }))
      contents.setIgnoreMenuShortcuts(recording || match)
      const frame = contents.focusedFrame
      const composing = input.isComposing || input.key === 'Dead' || deadKey || input.modifiers.includes('altgr')
      if (input.type === 'keyDown') deadKey = input.key === 'Dead'
      if (recording || composing || frame === null) { held.clear(); consumed.clear(); return }
      const main = frame === contents.mainFrame
      // Linux lets the DOM arbitrate terminal/editor keys before application commands.
      if (!scopedDesktop && main) return
      if (frame !== inputFrame || revision !== inputRevision) { held.clear(); inputFrame = frame; inputRevision = revision }
      const modifierKey = /^(Control|Alt|Shift|Meta)(Left|Right)$/u.test(input.code)
      if (input.type === 'keyUp') {
        if (consumed.get(input.code) === 'press') event.preventDefault()
        consumed.delete(input.code); held.delete(input.code); if (modifierKey) held.clear()
        return
      }
      if (!input.isAutoRepeat) consumed.delete(input.code)
      if (modifierKey) { held.clear(); return }
      if (input.isAutoRepeat && consumed.has(input.code) && !match) { event.preventDefault(); return }
      if (input.isAutoRepeat && !held.has(input.code) && !match) return
      held.add(input.code)
      const codes = [...held].sort()
      const pair: NativeBinding = { code: codes[0]!, ...(codes[1] === undefined ? {} : { secondCode: codes[1] }), modifiers }
      const binding = codes.length === 2 && keys.has(protocol.bindingKey(pair)) ? pair : { code: input.code, modifiers }
      if (!keys.has(protocol.bindingKey(binding))) return
      event.preventDefault()
      if (!input.isAutoRepeat) {
        if (binding.secondCode) { consumed.set(binding.code, 'repeat'); consumed.set(binding.secondCode, 'repeat') }
        consumed.set(input.code, 'press')
      }
      held.clear()
      let embedding = frame
      while (!main && embedding.parent && embedding.parent !== contents.mainFrame) embedding = embedding.parent
      contents.send(KEYBOARD_IPC.input, { kind: main ? 'keyboard' : 'iframe', revision, frameName: main ? '' : embedding.name,
        code: binding.code, ...(binding.secondCode ? { secondCode: binding.secondCode } : {}), repeat: input.isAutoRepeat,
        control: input.control, alt: input.alt, shift: input.shift, meta: input.meta })
    }
    contents.on('before-input-event', beforeInput)
    contents.on('blur', reset)
    page.on('blur', reset)
    contents.on('did-start-navigation', (_event, _url, inPlace, main) => {
      if (!main || inPlace) return
      recording = false; definitions = []; revision = undefined; keys.clear(); reset(); persistence.setDefinitions(null)
    })
    page.once('closed', () => { contents.off('before-input-event', beforeInput); contents.off('blur', reset); page.off('blur', reset) })
  }
  return {
    attach,
    sendEditingKey(keyCode: string, modifiers: Array<'control'>): void {
      const page = getWindow()
      if (!page || page.isDestroyed() || !page.isEnabled()) return
      const contents = page.webContents, previous = editing
      contents.focus(); editing = contents
      try {
        contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
        contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
      } finally { editing = previous; if (!contents.isDestroyed()) contents.setIgnoreMenuShortcuts(recording) }
    },
    dispose(): void { persistence.dispose() },
  }
}
