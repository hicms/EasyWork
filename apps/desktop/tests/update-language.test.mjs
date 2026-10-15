import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { CHROME_IPC } from '../src/window-chrome-contract.ts'

test('automatic update dialogs use startup language and appearance changes without opening a menu', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'easywork-update-language-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, 'package.json'), JSON.stringify({ easyworkUpdateTarget: 'nsis' }))
  await writeFile(join(directory, 'Uninstall EasyWork.exe'), '') // Presence marker only; never executed.
  const platform = Object.getOwnPropertyDescriptor(process, 'platform'), executable = process.execPath, resources = process.resourcesPath
  Object.defineProperty(process, 'platform', { value: 'win32' }); process.execPath = join(directory, 'EasyWork.exe')
  process.resourcesPath = directory
  t.after(() => { Object.defineProperty(process, 'platform', platform); process.execPath = executable; process.resourcesPath = resources })
  let finishDownload
  const download = new Promise(resolve => { finishDownload = resolve })
  const updater = Object.assign(new EventEmitter(), { setFeedURL() {},
    checkForUpdates: async () => ({ updateInfo: { version: '2.1.0-alpha.2' } }), downloadUpdate: () => download })
  const dialogs = [], handlers = new Map()
  globalThis.easyworkLanguageFixture = {
    updater,
    app: { isPackaged: true, getLocale: () => 'zh-CN', getVersion: () => '2.1.0-alpha.1', getAppPath: () => directory },
    dialog: { async showMessageBox(options) { dialogs.push(options); return { response: 0 } } },
    net: { fetch: async () => ({ ok: true, json: async () => [{ tag_name: 'v2.1.0-alpha.2', prerelease: true, draft: false }] }) },
    shell: {}, Menu: { setApplicationMenu() {}, buildFromTemplate: rows => rows }, ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
  }
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'electron') return { url: 'easywork-language:electron', shortCircuit: true }
      if (specifier === './desktop-updater.cjs') return { url: 'easywork-language:updater', shortCircuit: true }
      return next(specifier, context)
    },
    load(url, context, next) {
      if (url === 'easywork-language:electron') return { format: 'module', shortCircuit: true,
        source: ['app', 'dialog', 'net', 'shell', 'Menu', 'ipcMain'].map(name => `export const ${name} = globalThis.easyworkLanguageFixture.${name};`).join('\n') }
      if (url === 'easywork-language:updater') return { format: 'commonjs', shortCircuit: true,
        source: 'exports.createUpdater = () => globalThis.easyworkLanguageFixture.updater' }
      return next(url, context)
    },
  })
  t.after(() => { hook.deregister(); delete globalThis.easyworkLanguageFixture })
  const { installDesktopUpdates } = await import('../src/desktop-updates.ts')
  const { installWindowMenu } = await import('../src/window-menu.ts')
  const window = { setProgressBar() {}, setTitleBarOverlay() {} }
  const updates = installDesktopUpdates({ currentWindow: () => window, prepareInstall: async () => {}, installerStarted() {}, installFailed() {}, log() {} })
  assert(updates)
  let menuOpened = 0
  installWindowMenu({ currentWindow: () => window, restore() {}, command() {}, edit() {}, assertSender() {},
    updates: lang => { menuOpened++; return updates.menu(lang) }, languageChanged: lang => updates.setLanguage(lang) })
  // The renderer's ready notification supplies its selected language, even on a Chinese OS.
  updates.startup('en-US')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(dialogs[0].message, 'Version 2.1.0-alpha.2 is available')
  assert.equal(menuOpened, 0)
  handlers.get(CHROME_IPC.appearance)({}, 'zh-CN', '#fff', '#000')
  finishDownload([])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(dialogs[1].message, '更新已下载')
  assert.equal(menuOpened, 0)
})
