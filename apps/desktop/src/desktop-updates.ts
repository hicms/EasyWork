/** Native updater authority; the shared Profile owns the unobtrusive update notice. */
import { app, dialog, ipcMain, net, shell, type BrowserWindow, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { DesktopUpdateController } from './desktop-update-controller.ts'
import { releaseTag, selectRelease, UPDATE_RELEASES_URL, UPDATE_REPOSITORY, type UpdateMode } from './update-policy.ts'
import { UPDATE_IPC } from './desktop-update-ipc.ts'
import type { createUpdater } from './updater-runtime.ts'
import type { DesktopUpdateSnapshot } from '../../../packages/bundle/src/desktop-update-contract.js'

export function installDesktopUpdates(operations: {
  currentWindow(): BrowserWindow | undefined
  assertSender(event: IpcMainInvokeEvent): void
  prepareInstall(): Promise<void>
  installerStarted(): void
  installFailed(): void
  log(event: string, error?: unknown): void
}): { menu(language: string): MenuItemConstructorOptions[]; setLanguage(language: string): void; startup(language: string): void; suspend(): void } | undefined {
  let controller: DesktopUpdateController | undefined
  let suspended = false
  const snapshot = (): DesktopUpdateSnapshot | undefined => controller && !suspended
    ? { state: controller.state, version: controller.version } : undefined
  ipcMain.handle(UPDATE_IPC.get, event => { operations.assertSender(event); return snapshot() })
  if (!app.isPackaged || process.platform !== 'win32' || process.arch !== 'x64' || process.env.PORTABLE_EXECUTABLE_FILE) return
  const manifest = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { easyworkUpdateTarget?: string }
  if (!['nsis', 'nsis-acceptance'].includes(manifest.easyworkUpdateTarget ?? '')
    || !existsSync(join(dirname(process.execPath), 'Uninstall EasyWork.exe'))) return
  const mode: UpdateMode = manifest.easyworkUpdateTarget === 'nsis-acceptance' ? 'unsigned-acceptance' : 'signed'
  const version = app.getVersion()
  let updater: ReturnType<typeof createUpdater>
  try {
    releaseTag(version, mode)
    const runtime = createRequire(import.meta.url)('./desktop-updater.cjs') as { createUpdater: typeof createUpdater }
    updater = runtime.createUpdater(join(process.resourcesPath, 'app-update.yml'), operations.installerStarted, mode)
  } catch (error) {
    operations.log('update.unavailable', error)
    return
  }
  // Avoid logs containing feed responses or signed download URLs.
  updater.logger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }
  let manual = false, started = false, language = app.getLocale(), installing = false
  let timer: ReturnType<typeof setInterval> | undefined
  const zh = (): boolean => language.startsWith('zh')
  const update = new DesktopUpdateController(updater, {
    currentVersion: version, mode,
    async discover() {
      const releases: unknown[] = []
      for (let page = 1; page <= 10; page++) {
        const response = await net.fetch(`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases?per_page=100&page=${page}`, {
          headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
        const batch: unknown = await response.json()
        if (!Array.isArray(batch)) throw new Error('Invalid GitHub release list')
        releases.push(...batch)
        if (batch.length < 100) return selectRelease(releases, version, mode)
      }
      throw new Error('Release history exceeds the supported lookup limit')
    },
    changed() {
      if (suspended) return
      const page = operations.currentWindow()
      page?.setProgressBar(update.state === 'downloading' ? update.percent / 100 : -1)
      const state = snapshot()
      if (state && page && !page.isDestroyed()) page.webContents.send(UPDATE_IPC.changed, state)
    },
    error(error, phase) {
      operations.log(`update.${phase}-failed`, error)
      if (suspended || (!manual && !installing)) return
      void dialog.showMessageBox({ type: 'error', title: 'EasyWork',
        message: zh() ? '更新未完成，请稍后重试。' : 'Update did not complete. Please retry later.',
        detail: zh() ? '请先保存工作并结束运行中的任务。若安装失败，可从发行页面下载完整 Setup 安装包修复。' : 'Save your work and finish running tasks first. If installation fails, use the full Setup from Releases to repair it.',
        buttons: zh() ? ['关闭', '打开发行页面'] : ['Close', 'Open releases'], defaultId: 0, cancelId: 0,
      }).then(result => { if (!suspended && result.response === 1) void shell.openExternal(UPDATE_RELEASES_URL) })
    },
    prepareInstall: operations.prepareInstall,
    installFailed: operations.installFailed,
  })
  controller = update
  async function check(): Promise<void> {
    if (suspended) return
    manual = true
    try {
      await update.check()
      if (!suspended && update.state === 'idle') await dialog.showMessageBox({ title: 'EasyWork', message: zh() ? '当前渠道暂无新版本。' : 'No new version in this channel.' })
    } finally { manual = false }
  }
  async function restart(): Promise<void> {
    if (suspended || installing || update.state !== 'downloaded') return
    installing = true
    try { await update.install(language) } finally { installing = false }
  }
  ipcMain.handle(UPDATE_IPC.check, event => { operations.assertSender(event); return check() })
  ipcMain.handle(UPDATE_IPC.restart, event => { operations.assertSender(event); return restart() })
  ipcMain.handle(UPDATE_IPC.notes, event => {
    operations.assertSender(event)
    if (!suspended && update.version) return shell.openExternal(`${UPDATE_RELEASES_URL}/tag/${releaseTag(update.version, mode)}`)
  })
  return {
    menu(lang) {
      language = lang
      return [
        { label: zh() ? '检查更新…' : 'Check for updates…', enabled: !suspended && ['idle', 'error'].includes(update.state), click: () => { void check() } },
        ...(update.state === 'downloading' ? [{ label: `${zh() ? '正在下载更新' : 'Downloading update'} ${Math.floor(update.percent)}%`, enabled: false }] : []),
        { label: zh() ? '重启升级' : 'Restart and update', enabled: !suspended && update.state === 'downloaded', click: () => { void restart() } },
      ]
    },
    setLanguage(lang) { language = lang },
    startup(lang) {
      language = lang
      if (started || suspended) return
      started = true; void update.check()
      timer = setInterval(() => { void update.check() }, 6 * 60 * 60 * 1000)
      timer.unref()
    },
    suspend() { suspended = true; if (timer) clearInterval(timer); update.suspend() },
  }
}
