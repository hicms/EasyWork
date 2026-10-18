/** Native menus for the carrier's Windows caption, preserving editor-owned history. */
import { app, ipcMain, Menu, type BrowserWindow, type ContextMenuParams, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import { CHROME_IPC, chromeLabels, isWindowLanguage } from './window-chrome-contract.ts'

export function installWindowMenu(operations: {
  currentWindow(): BrowserWindow | undefined,
  restore(): void,
  command(): void,
  about(language: string): void,
  updates(language: string): MenuItemConstructorOptions[],
  languageChanged(language: string): void,
  edit(keyCode: string, modifiers: Array<'control'>): void,
  assertSender(event: IpcMainInvokeEvent): void,
}): () => string {
  let language = app.getLocale()
  operations.languageChanged(language)
  const applicationItems = (): MenuItemConstructorOptions[] => {
    const labels = chromeLabels(language)
    return [
      { label: labels.open, click: operations.restore },
      { label: labels.command, click: operations.command },
      ...operations.updates(language),
      // macOS already provides About in its application menu.
      ...(process.platform === 'darwin' ? [] : [{ label: labels.about, click: () => { operations.about(language) } }]),
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
  if (process.platform !== 'win32') return () => language

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
  return () => language
}

export function installContextMenu(page: BrowserWindow, getLanguage: () => string): void {
  page.webContents.on('context-menu', (_event, params: ContextMenuParams) => {
    const { editFlags } = params
    const labels = chromeLabels(getLanguage())
    if (params.isEditable) {
      const items: MenuItemConstructorOptions[] = [
        { label: labels.undo, role: 'undo', enabled: editFlags.canUndo },
        { label: labels.redo, role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' },
        { label: labels.cut, role: 'cut', enabled: editFlags.canCut },
        { label: labels.copy, role: 'copy', enabled: editFlags.canCopy },
        { label: labels.paste, role: 'paste', enabled: editFlags.canPaste },
        { label: labels.delete, role: 'delete', enabled: editFlags.canDelete },
        { type: 'separator' },
        { label: labels.selectAll, role: 'selectAll', enabled: editFlags.canSelectAll },
      ]
      Menu.buildFromTemplate(items).popup({ window: page })
      return
    }

    void page.webContents.executeJavaScript(contextTargetScript(params.x, params.y), true)
      .then(result => {
        if (result?.surface === 'sidebar-row') return
        if (result?.surface !== 'conversation') return
        const items: MenuItemConstructorOptions[] = [
          { label: labels.copy, role: 'copy', enabled: editFlags.canCopy },
          { type: 'separator' },
          { label: labels.selectAll, enabled: result.hasText, click: () => { selectConversation(page, params.x, params.y) } },
        ]
        Menu.buildFromTemplate(items).popup({ window: page })
      })
      .catch(error => { console.error('EasyWork context menu target detection failed', error) })
  })
}

function contextTargetScript(x: number, y: number): string {
  return `(() => {
    const target = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
    if (!(target instanceof Element)) return { surface: 'other', hasText: false };
    const row = target.closest('[data-row-key^="workspace:"], [data-row-key^="session:"]');
    if (row instanceof Element) {
      const buttons = row.querySelectorAll('button');
      const isSession = row.getAttribute('data-row-key')?.startsWith('session:') === true;
      const menuButton = isSession || buttons.length > 1 ? buttons[0] : null;
      if (menuButton instanceof HTMLButtonElement) {
        menuButton.click();
        let attempts = 0;
        const placeMenu = () => {
          const menus = [...document.querySelectorAll('[role="menu"]')].filter((item) => {
            if (!(item instanceof HTMLElement)) return false;
            const box = item.getBoundingClientRect();
            return getComputedStyle(item).visibility !== 'hidden' && box.width > 0 && box.height > 0;
          });
          const menu = menus.at(-1);
          if (menu instanceof HTMLElement) {
            const margin = 12;
            const left = Math.min(Math.max(${JSON.stringify(x)}, margin), window.innerWidth - menu.offsetWidth - margin);
            const top = Math.min(Math.max(${JSON.stringify(y)}, margin), window.innerHeight - menu.offsetHeight - margin);
            menu.style.setProperty('left', left + 'px', 'important');
            menu.style.setProperty('top', top + 'px', 'important');
            return;
          }
          if (attempts++ < 20) requestAnimationFrame(placeMenu);
        };
        requestAnimationFrame(placeMenu);
      }
      return { surface: 'sidebar-row', hasText: false };
    }
    const chat = target.closest('[data-conversation-region="chat"], [data-conversation-content]');
    const scroll = target.closest('[data-conversation-scroll]')
      ?? chat?.querySelector('[data-conversation-scroll]');
    const conversation = chat instanceof Element ? chat : scroll?.closest('[data-conversation-region="chat"], [data-conversation-content]');
    const messageNodes = scroll === null || scroll === undefined
      ? []
      : [...scroll.querySelectorAll('[data-chat-flow-key], [data-chat-node-key]')];
    return {
      surface: conversation instanceof Element || scroll instanceof Element ? 'conversation' : 'other',
      hasText: messageNodes.some(node => (node.textContent?.trim().length ?? 0) > 0),
    };
  })()`
}

function selectConversation(page: BrowserWindow, x: number, y: number): void {
  const script = `(() => {
    const target = document.elementFromPoint(${JSON.stringify(x)}, ${JSON.stringify(y)});
    const chat = target instanceof Element
      ? target.closest('[data-conversation-region="chat"], [data-conversation-content]')
      : null;
    const scroll = target instanceof Element
      ? target.closest('[data-conversation-scroll]') ?? chat?.querySelector('[data-conversation-scroll]')
      : null;
    if (!(scroll instanceof Element)) return false;
    const messageNodes = [...scroll.querySelectorAll('[data-chat-flow-key], [data-chat-node-key]')];
    let first = null;
    let last = null;
    for (const message of messageNodes) {
      const walker = document.createTreeWalker(message, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const element = node.parentElement;
          if (element?.closest('button, [role="button"], [hidden], [aria-hidden="true"]')) return NodeFilter.FILTER_REJECT;
          return node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      while (walker.nextNode()) {
        if (first === null) first = walker.currentNode;
        last = walker.currentNode;
      }
    }
    if (!(first instanceof Text) || !(last instanceof Text)) return false;
    const range = document.createRange();
    range.setStart(first, 0);
    range.setEnd(last, last.nodeValue?.length ?? 0);
    const selection = window.getSelection();
    if (selection === null) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  })()`
  void page.webContents.executeJavaScript(script, true).catch(error => {
    console.error('EasyWork conversation selection failed', error)
  })
}
