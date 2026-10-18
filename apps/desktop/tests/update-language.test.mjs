import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { registerHooks } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { CHROME_IPC } from '../src/window-chrome-contract.ts'
import { UPDATE_IPC } from '../src/desktop-update-ipc.ts'

test('acceptance startup downloads without a modal; trusted UI reads state and notes; suspend clears retry and blocks restart', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'easywork-update-language-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(join(directory, 'package.json'), JSON.stringify({ easyworkUpdateTarget: 'nsis-acceptance' }))
  await writeFile(join(directory, 'Uninstall EasyWork.exe'), '') // Presence marker only; never executed.
  const platform = Object.getOwnPropertyDescriptor(process, 'platform'), executable = process.execPath, resources = process.resourcesPath
  Object.defineProperty(process, 'platform', { value: 'win32' }); process.execPath = join(directory, 'EasyWork.exe')
  process.resourcesPath = directory
  t.after(() => { Object.defineProperty(process, 'platform', platform); process.execPath = executable; process.resourcesPath = resources })
  let finishDownload
  const download = new Promise(resolve => { finishDownload = resolve })
  let checks = 0, retry
  const launches = []
  const updater = Object.assign(new EventEmitter(), { setFeedURL() {},
    checkForUpdates: async () => { checks++; return { updateInfo: { version: '2.1.0-alpha.2' } } }, downloadUpdate: () => download,
    validateCandidate: async () => {}, launchAndQuit: async language => { launches.push(language) } })
  const dialogs = [], states = [], links = [], logs = [], handlers = new Map(), trusted = {}
  let offline = true
  const networkError = Object.assign(new Error('private network response'), { code: 'ECONNRESET' })
  const timer = { unref() {} }
  t.mock.method(globalThis, 'setInterval', (callback, delay) => { assert.equal(delay, 6 * 60 * 60 * 1000); retry = callback; return timer })
  const clear = t.mock.method(globalThis, 'clearInterval', value => { assert.equal(value, timer) })
  globalThis.easyworkLanguageFixture = {
    updater,
    app: { isPackaged: true, getLocale: () => 'zh-CN', getVersion: () => '2.1.0-alpha.1', getAppPath: () => directory },
    dialog: { async showMessageBox(options) { dialogs.push(options); return { response: 0 } } },
    net: { fetch: async () => {
      if (offline) throw networkError
      return { ok: true, json: async () => [{ tag_name: 'acceptance-v2.1.0-alpha.2', prerelease: true, draft: false }] }
    } },
    shell: { openExternal: async url => { links.push(url) } }, Menu: { setApplicationMenu() {}, buildFromTemplate: rows => rows }, ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
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
  const window = { setProgressBar() {}, setTitleBarOverlay() {}, isDestroyed: () => false, webContents: { send: (_name, value) => states.push(value) } }
  const updates = installDesktopUpdates({ currentWindow: () => window, assertSender: event => assert.equal(event, trusted), prepareInstall: async () => {}, installerStarted() {}, installFailed() {}, log: (event, error) => logs.push({ event, error }) })
  assert(updates)
  let menuOpened = 0
  installWindowMenu({ currentWindow: () => window, restore() {}, command() {}, edit() {}, assertSender() {},
    updates: lang => { menuOpened++; return updates.menu(lang) }, languageChanged: lang => updates.setLanguage(lang) })
  // The renderer's ready notification supplies its selected language, even on a Chinese OS.
  updates.startup('en-US')
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(states.at(-1).state, 'error')
  assert.equal(logs[0].event, 'update.checking-failed')
  assert.equal(logs[0].error, networkError)
  assert.equal(dialogs.length, 0)
  offline = false; retry()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(dialogs.length, 0)
  assert.equal(states.at(-1).state, 'downloading')
  assert.equal(menuOpened, 0)
  handlers.get(CHROME_IPC.appearance)({}, 'zh-CN', '#fff', '#000')
  finishDownload([])
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(dialogs.length, 0)
  assert.equal(states.at(-1).state, 'downloaded')
  assert.equal(menuOpened, 0)
  assert.equal(updates.menu('zh-CN').at(-1).label, '重启升级')
  assert.throws(() => handlers.get(UPDATE_IPC.restart)({}))
  assert.equal(handlers.get(UPDATE_IPC.get)(trusted).state, 'downloaded')
  await handlers.get(UPDATE_IPC.notes)(trusted)
  assert.deepEqual(links, ['https://github.com/hicms/EasyWork/releases/tag/acceptance-v2.1.0-alpha.2'])
  // The installer's progress window follows the latest UI language, not the zh-CN OS locale.
  updates.setLanguage('en-US')
  await handlers.get(UPDATE_IPC.restart)(trusted)
  assert.deepEqual(launches, ['en-US'])
  updates.suspend(); retry()
  await handlers.get(UPDATE_IPC.restart)(trusted)
  assert.deepEqual(launches, ['en-US']); assert.equal(checks, 1)
  assert.equal(clear.mock.callCount(), 1)
  assert.equal(handlers.get(UPDATE_IPC.get)(trusted), undefined)
})
