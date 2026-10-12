/** Native window decoration and state synchronization, matching official Desktop. */
import { nativeTheme, type BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'
import { CHROME_IPC, WINDOWS_TITLEBAR_HEIGHT } from './window-chrome-contract.ts'

function fallbackFill(): string {
  return nativeTheme.shouldUseDarkColors ? '#1b1b1c' : '#f9fafb'
}

export function windowChromeOptions(): BrowserWindowConstructorOptions {
  if (process.platform === 'win32') return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { height: WINDOWS_TITLEBAR_HEIGHT, color: fallbackFill(),
      symbolColor: nativeTheme.shouldUseDarkColors ? '#f9fafb' : '#0f1115' },
  }
  if (process.platform === 'darwin') return {
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'sidebar', visualEffectState: 'active', backgroundColor: '#00000000',
  }
  return {}
}

export function syncWindowChrome(page: BrowserWindow): void {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    const send = (): void => { if (!page.isDestroyed()) page.webContents.send(CHROME_IPC.fullscreen, page.isFullScreen()) }
    page.on('enter-full-screen', send)
    page.on('leave-full-screen', send)
    page.webContents.on('did-finish-load', send)
    page.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && page.isFullScreen()) {
        event.preventDefault(); page.setFullScreen(false)
      }
    })
  }
  if (process.platform === 'darwin') {
    // The native vibrancy view reattaches late after restore; keep the animation opaque.
    const backdrop = (): void => {
      if (page.isDestroyed()) return
      if (page.isMinimized() || !page.isVisible()) {
        page.setVibrancy(null); page.setBackgroundColor(fallbackFill())
      } else {
        page.setVibrancy('sidebar'); page.setBackgroundColor('#00000000')
      }
    }
    page.on('minimize', backdrop); page.on('hide', backdrop)
    page.on('restore', backdrop); page.on('show', backdrop)
  }
}
