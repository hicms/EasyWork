/** Trusted product-frame keyboard and preference capabilities. */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { KEYBOARD_IPC, type NativeKeyboardInput, type ShortcutSnapshot } from './keyboard-contract.ts'

export function exposeKeyboard(): void {
  contextBridge.exposeInMainWorld('dshDesktop', {
    protocolVersion: 1,
    keyboard: {
      closeWindow: (revision: string) => ipcRenderer.invoke(KEYBOARD_IPC.close, revision),
      subscribe: (listener: (input: NativeKeyboardInput) => void) => {
        const handle = (_event: IpcRendererEvent, input: NativeKeyboardInput): void => {
          if (input.kind === 'iframe') {
            const frame = document.activeElement
            if (!(frame instanceof HTMLIFrameElement) || !frame.isConnected
              || !frame.matches('iframe[data-sidebar-browser-frame], iframe[data-html-preview]')
              || !input.frameName || frame.name !== input.frameName) return
          }
          listener(input)
        }
        ipcRenderer.on(KEYBOARD_IPC.input, handle)
        return () => { ipcRenderer.off(KEYBOARD_IPC.input, handle) }
      },
    },
    shortcuts: {
      get: (definitions: readonly unknown[]) => ipcRenderer.invoke(KEYBOARD_IPC.get, definitions),
      edit: (edit: unknown, revision: string) => ipcRenderer.invoke(KEYBOARD_IPC.edit, edit, revision),
      recording: (active: boolean) => ipcRenderer.invoke(KEYBOARD_IPC.recording, active),
      subscribe: (listener: (snapshot: ShortcutSnapshot) => void) => {
        const handle = (_event: IpcRendererEvent, snapshot: ShortcutSnapshot): void => { listener(snapshot) }
        ipcRenderer.on(KEYBOARD_IPC.changed, handle)
        return () => { ipcRenderer.off(KEYBOARD_IPC.changed, handle) }
      },
    },
  })
}
