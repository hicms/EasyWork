import { contextBridge, ipcRenderer } from 'electron'
import { APP_SCHEME, BOOT_IPC, type DesktopBootInfo } from './startup-contract.ts'
import { installWindowChrome } from './preload-window-chrome.ts'
import { exposeKeyboard } from './preload-keyboard.ts'

if (process.isMainFrame && location.protocol === `${APP_SCHEME}:` && location.hostname === 'app') {
  exposeKeyboard()
  installWindowChrome()
  const preloads = new Set<HTMLLinkElement>()
  const urls = new Set<string>()
  let disposed = false, completed = false
  const preloadScripts = (boot: DesktopBootInfo): void => {
    if (disposed || completed) return
    for (const row of boot.injections) {
      if (!row || typeof row !== 'object' || !('kind' in row) || row.kind !== 'script-preload'
        || !('src' in row) || typeof row.src !== 'string') continue
      let url: URL
      try { url = new URL(row.src, location.href) } catch { continue }
      if (url.protocol !== `${APP_SCHEME}:` || url.hostname !== 'app' || url.port || url.username || url.password
        || !url.pathname.startsWith('/plugins/') || !url.searchParams.get('rev') || urls.has(url.href)) continue
      urls.add(url.href)
      const link = document.createElement('link')
      link.rel = 'preload'; link.as = 'script'; link.href = url.href
      document.head.append(link)
      preloads.add(link)
    }
  }
  const clearPreloads = (): void => { for (const link of preloads) link.remove(); preloads.clear() }
  // Observe the official boot indicator only. No page text or user content crosses IPC.
  let seen = false, lastArc = -1
  const observer = new MutationObserver(() => {
    const loading = document.querySelector('[data-dsh-boot]')
    if (!loading) {
      if (seen && !completed) { completed = true; observer.disconnect(); clearPreloads(); report(false, lastArc) }
      return
    }
    seen = true
    const spinner = loading.querySelector<HTMLElement>('[data-dsh-boot-spinner]')
    const value = Number.parseFloat(spinner?.style.getPropertyValue('--dsh-boot-arc') ?? '')
    const arc = Number.isFinite(value) && value >= 72 && value <= 288 ? value : 0
    if (arc !== lastArc) { lastArc = arc; report(true, arc) }
  })
  const report = (loading: boolean, arc: number): void => {
    void ipcRenderer.invoke(BOOT_IPC.progress, { loading, arc, language: document.documentElement.lang || navigator.language }).catch(() => {})
  }
  observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'data-dsh-boot'] })
  window.addEventListener('pagehide', () => { disposed = true; observer.disconnect(); clearPreloads() }, { once: true })
  contextBridge.exposeInMainWorld('dshDesktopBoot', {
    ready: async (): Promise<DesktopBootInfo> => {
      const boot: DesktopBootInfo = await ipcRenderer.invoke(BOOT_IPC.ready)
      // The official Desktop entry skips these HTML hints; begin fetching without executing any factory.
      preloadScripts(boot)
      return boot
    },
    failed: (message: string): Promise<void> => ipcRenderer.invoke(BOOT_IPC.failed, message),
  })
}
