/** Enables the desktop layout already supplied by the official published frontend. */
import { ipcRenderer } from 'electron'
import { CHROME_IPC, WINDOWS_TITLEBAR_HEIGHT } from './window-chrome-contract.ts'
import { installCaptionMenu } from './preload-window-menu.ts'

export function installWindowChrome(): void {
  const mark = (): void => {
    const root = document.documentElement
    root.dataset.platform = process.platform
    if (process.platform === 'win32') {
      root.dataset.windowsTitlebar = ''
      root.style.setProperty('--dsh-windows-titlebar-height', `${WINDOWS_TITLEBAR_HEIGHT}px`)
    }
  }
  if (document.documentElement) mark()
  else window.addEventListener('DOMContentLoaded', mark, { once: true })
  if (process.platform === 'darwin' || process.platform === 'win32') {
    ipcRenderer.on(CHROME_IPC.fullscreen, (_event, fullscreen: boolean) => {
      document.documentElement.toggleAttribute('data-fullscreen', fullscreen)
    })
  }
  if (process.platform !== 'win32') return
  const install = (): void => {
    mark()
    const menu = installCaptionMenu(), root = document.documentElement
    const probe = document.createElement('span')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;background-color:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary)'
    document.body.append(probe)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('EasyWork caption requires a 2D canvas context')
    const nativeColor = (value: string): string => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1)
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
      return `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 255})`
    }
    let previous = ''
    const send = (): void => {
      const style = getComputedStyle(probe)
      const values = [root.lang || 'zh-CN', nativeColor(style.backgroundColor), nativeColor(style.color)]
      const current = JSON.stringify(values)
      if (current === previous) return
      previous = current; menu.update()
      void ipcRenderer.invoke(CHROME_IPC.appearance, ...values).catch(error => { console.error('EasyWork caption appearance failed', error) })
    }
    const observer = new MutationObserver(send)
    observer.observe(root, { attributes: true, attributeFilter: ['lang'] })
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'style'] })
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    document.head.addEventListener('load', send, true)
    window.addEventListener('pagehide', () => {
      observer.disconnect(); menu.dispose(); probe.remove(); document.head.removeEventListener('load', send, true)
    }, { once: true })
    send()
  }
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', install, { once: true })
  else install()
}
