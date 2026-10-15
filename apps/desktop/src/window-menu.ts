/** Native menus for the carrier's Windows caption, preserving editor-owned history. */
import { app, ipcMain, Menu, type BrowserWindow, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import { CHROME_IPC, chromeLabels, isWindowLanguage } from './window-chrome-contract.ts'

export function installWindowMenu(operations: {
  currentWindow(): BrowserWindow | undefined,
  restore(): void,
  command(): void,
  updates(language: string): MenuItemConstructorOptions[],
  languageChanged(language: string): void,
  edit(keyCode: string, modifiers: Array<'control'>): void,
  assertSender(event: IpcMainInvokeEvent): void,
}): void {
  let language = app.getLocale()
  operations.languageChanged(language)
  const applicationItems = (): MenuItemConstructorOptions[] => {
    const labels = chromeLabels(language)
    return [
      { label: labels.open, click: operations.restore },
      { label: labels.command, click: operations.command },
      ...operations.updates(language),
      { type: 'separator' },
      { label: labels.quit, accelerator: 'CmdOrCtrl+Q', click: () => { app.quit() } },
    ]
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(process.platform === 'win32' ? [
    { role: 'toggleDevTools', visible: false },
    { role: 'toggleDevTools', visible: false, accelerator: 'F12' },
    { role: 'togglefullscreen', visible: false, accelerator: 'F11' },
    { label: chromeLabels(language).quit, visible: false, accelerator: 'Ctrl+Q', click: () => { app.quit() } },
  ] : [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { label: chromeLabels(language).application, submenu: applicationItems() },
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
  ]))
  if (process.platform !== 'win32') return

  ipcMain.handle(CHROME_IPC.menu, (event, name: unknown, x: unknown, y: unknown) => {
    operations.assertSender(event)
    const page = operations.currentWindow()!
    if ((name !== 'application' && name !== 'edit') || typeof x !== 'number' || typeof y !== 'number'
      || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > 100_000 || y > 100_000) {
      throw new Error('无效的窗口菜单请求')
    }
    const labels = chromeLabels(language)
    const edit = (label: string, keyCode: string, modifiers: Array<'control'>, accelerator?: string): MenuItemConstructorOptions => ({
      // The client owns editing shortcuts; the native menu only displays their labels.
      label, ...(accelerator === undefined ? {} : { accelerator, registerAccelerator: false }),
      click: () => { operations.edit(keyCode, modifiers) },
    })
    const items: MenuItemConstructorOptions[] = name === 'application' ? applicationItems() : [
      edit(labels.undo, 'Z', ['control'], 'Ctrl+Z'), edit(labels.redo, 'Y', ['control'], 'Ctrl+Y'), { type: 'separator' },
      edit(labels.cut, 'X', ['control'], 'Ctrl+X'), edit(labels.copy, 'C', ['control'], 'Ctrl+C'), edit(labels.paste, 'V', ['control'], 'Ctrl+V'),
      edit(labels.delete, 'Delete', []), { type: 'separator' }, edit(labels.selectAll, 'A', ['control'], 'Ctrl+A'),
    ]
    const zoom = page.webContents.getZoomFactor()
    return new Promise<void>(resolve => {
      Menu.buildFromTemplate(items).popup({ window: page, x: Math.round(x * zoom), y: Math.round(y * zoom), callback: resolve })
    })
  })
  ipcMain.handle(CHROME_IPC.appearance, (event, lang: unknown, color: unknown, symbolColor: unknown) => {
    operations.assertSender(event)
    if (!isWindowLanguage(lang)) throw new Error('无效的窗口语言')
    const validColor = (value: unknown): value is string => typeof value === 'string'
      && /^(?:#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/iu.test(value)
    if (!validColor(color) || !validColor(symbolColor)) throw new Error('无效的窗口颜色')
    language = lang
    operations.languageChanged(lang)
    operations.currentWindow()!.setTitleBarOverlay({ color, symbolColor })
  })
}
