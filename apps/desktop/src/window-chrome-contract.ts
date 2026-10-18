/** Carrier caption geometry and IPC; the published frontend owns its layout. */
export const WINDOWS_TITLEBAR_HEIGHT = 40
export const CHROME_IPC = {
  appearance: 'easywork:window-appearance',
  menu: 'easywork:window-menu',
  fullscreen: 'easywork:window-fullscreen',
} as const

export function isWindowLanguage(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z]+(?:-[a-zA-Z0-9]+)*$/u.test(value)
}

export function chromeLabels(language: string) {
  return /^en(?:-|$)/iu.test(language)
    ? { application: 'Application', edit: 'Edit', menubar: 'Application menu', open: 'Open EasyWork', about: 'About EasyWork', quit: 'Quit EasyWork', command: 'Terminal command dsh (optional)…',
      undo: 'Undo', redo: 'Redo', cut: 'Cut', copy: 'Copy', paste: 'Paste', delete: 'Delete', selectAll: 'Select All' }
    : { application: '应用程序', edit: '编辑', menubar: '应用菜单', open: '打开 EasyWork', about: '关于 EasyWork', quit: '退出 EasyWork', command: '终端命令 dsh（可选）…',
      undo: '撤销', redo: '重做', cut: '剪切', copy: '复制', paste: '粘贴', delete: '删除', selectAll: '全选' }
}
