import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { UPDATE_IPC } from './desktop-update-ipc.ts'
import type { DesktopUpdateBridge, DesktopUpdateSnapshot } from '../../../packages/bundle/src/desktop-update-contract.js'

export function exposeUpdates(): void {
  const bridge: DesktopUpdateBridge = {
    get: () => ipcRenderer.invoke(UPDATE_IPC.get),
    check: () => ipcRenderer.invoke(UPDATE_IPC.check),
    restart: () => ipcRenderer.invoke(UPDATE_IPC.restart),
    releaseNotes: () => ipcRenderer.invoke(UPDATE_IPC.notes),
    subscribe(listener) {
      const handle = (_event: IpcRendererEvent, state: DesktopUpdateSnapshot): void => { listener(state) }
      ipcRenderer.on(UPDATE_IPC.changed, handle)
      return () => { ipcRenderer.off(UPDATE_IPC.changed, handle) }
    },
  }
  contextBridge.exposeInMainWorld('easyworkUpdates', bridge)
}
