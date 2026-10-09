import { contextBridge, ipcRenderer } from 'electron'
import { APP_SCHEME, BOOT_IPC, type DesktopBootInfo } from './startup-contract.ts'

if (process.isMainFrame && location.protocol === `${APP_SCHEME}:` && location.hostname === 'app') {
  contextBridge.exposeInMainWorld('dshDesktopBoot', {
    ready: (): Promise<DesktopBootInfo> => ipcRenderer.invoke(BOOT_IPC.ready),
    failed: (message: string): Promise<void> => ipcRenderer.invoke(BOOT_IPC.failed, message),
  })
}
