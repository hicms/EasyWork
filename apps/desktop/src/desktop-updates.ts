/** Native update controls, outside the official client and its renderer IPC. */
import { app, dialog, net, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { DesktopUpdateController } from './desktop-update-controller.ts'
import { selectRelease, UPDATE_RELEASES_URL, UPDATE_REPOSITORY, updateChannel } from './update-policy.ts'
import type { createUpdater } from './updater-runtime.ts'

export function installDesktopUpdates(operations: {
  currentWindow(): BrowserWindow | undefined
  prepareInstall(): Promise<void>
  installerStarted(): void
  installFailed(): void
  log(event: string): void
}): { menu(language: string): MenuItemConstructorOptions[]; setLanguage(language: string): void; startup(language: string): void; suspend(): void } | undefined {
  if (!app.isPackaged || process.platform !== 'win32' || process.arch !== 'x64' || process.env.PORTABLE_EXECUTABLE_FILE) return
  const manifest = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as { easyworkUpdateTarget?: string }
  if (manifest.easyworkUpdateTarget !== 'nsis' || !existsSync(join(dirname(process.execPath), 'Uninstall EasyWork.exe'))) return
  const version = app.getVersion()
  let controller: DesktopUpdateController | undefined
  let updater: ReturnType<typeof createUpdater>
  try {
    updateChannel(version)
    const runtime = createRequire(import.meta.url)('./desktop-updater.cjs') as { createUpdater: typeof createUpdater }
    updater = runtime.createUpdater(join(process.resourcesPath, 'app-update.yml'), () => controller?.state === 'installing', operations.installerStarted)
  } catch {
    operations.log('update.unavailable')
    return
  }
  // Avoid updater debug logs containing feed responses or signed download URLs.
  updater.logger = { info: () => {}, warn: () => {}, debug: () => {}, error: () => {} }
  let manual = false, started = false, language = app.getLocale(), prompt = false
  const zh = (): boolean => language.startsWith('zh')
  const update = new DesktopUpdateController(updater, {
    currentVersion: version,
    async discover() {
      const releases: unknown[] = []
      // Bound network work; draft and mismatched channels are rejected independently below.
      for (let page = 1; page <= 10; page++) {
        const response = await net.fetch(`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases?per_page=100&page=${page}`, {
          headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000),
        })
        if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`)
        const batch: unknown = await response.json()
        if (!Array.isArray(batch)) throw new Error('Invalid GitHub release list')
        releases.push(...batch)
        if (batch.length < 100) return selectRelease(releases, version)
      }
      throw new Error('Release history exceeds the supported lookup limit')
    },
    changed() {
      operations.currentWindow()?.setProgressBar(update.state === 'downloading' ? update.percent / 100 : -1)
      if (update.state === 'available') void offerDownload()
      if (update.state === 'downloaded') void notifyDownloaded()
    },
    error() {
      operations.log('update.' + update.state)
      if (manual || ['downloading', 'stopping', 'installing'].includes(previousAction)) {
        void dialog.showMessageBox({ type: 'error', title: 'EasyWork',
          message: zh() ? '更新未完成，未确认安全停止时不会安装。' : 'Update did not complete. Installation requires a confirmed safe shutdown.',
          detail: zh() ? '请保存工作后重试。若安装失败，请从发行页面下载完整 Setup 安装包修复；这不会自动回滚。' : 'Save your work and retry. If installation fails, use the full Setup from Releases to repair it; automatic rollback is not supported.',
          buttons: zh() ? ['关闭', '打开发行页面'] : ['Close', 'Open releases'], defaultId: 0, cancelId: 0,
        }).then(result => { if (result.response === 1) void shell.openExternal(UPDATE_RELEASES_URL) })
      }
    },
    prepareInstall: operations.prepareInstall,
    installFailed: operations.installFailed,
  })
  controller = update
  let previousAction = ''

  async function offerDownload(): Promise<void> {
    if (prompt) return
    prompt = true
    try {
      const result = await dialog.showMessageBox({ type: 'info', title: 'EasyWork',
        message: zh() ? `发现新版本 ${update.version}` : `Version ${update.version} is available`,
        detail: zh() ? '下载期间可以继续工作。安装需要另行确认重启。' : 'Keep working during download. Installation requires a separate restart confirmation.',
        buttons: zh() ? ['下载更新', '稍后'] : ['Download update', 'Later'], defaultId: 1, cancelId: 1,
      })
      if (result.response === 0) { previousAction = 'downloading'; void update.download() }
    } finally { prompt = false }
  }
  async function notifyDownloaded(): Promise<void> {
    // A prompt never triggers installation; the menu is the explicit restart action.
    await dialog.showMessageBox({ type: 'info', title: 'EasyWork',
      message: zh() ? '更新已下载' : 'Update downloaded',
      detail: zh() ? '准备好后，请选择“应用程序 → 重启并更新”。普通退出不会安装。' : 'When ready, choose Application → Restart and update. Normal quit will not install it.',
    })
  }
  async function check(): Promise<void> {
    manual = true; previousAction = 'checking'
    await update.check()
    if (update.state === 'idle') await dialog.showMessageBox({ title: 'EasyWork', message: zh() ? '当前渠道暂无新版本。' : 'No new version in this channel.' })
  }
  async function restart(): Promise<void> {
    if (prompt || update.state !== 'downloaded') return
    prompt = true
    try {
      const result = await dialog.showMessageBox({ type: 'question', title: 'EasyWork',
        message: zh() ? '重启并更新 EasyWork？' : 'Restart and update EasyWork?',
        detail: zh() ? '请先保存草稿并结束运行中的任务。应用会等待后台安全退出；无法确认时将暂缓安装。' : 'Save drafts and finish running tasks first. Installation waits for safe background shutdown and is deferred if it cannot be confirmed.',
        buttons: zh() ? ['取消', '重启并更新'] : ['Cancel', 'Restart and update'], defaultId: 0, cancelId: 0,
      })
      if (result.response === 1) { previousAction = 'stopping'; await update.install() }
    } finally { prompt = false }
  }
  return {
    menu(lang) {
      language = lang
      return [
        { label: zh() ? '检查更新…' : 'Check for updates…', enabled: ['idle', 'error', 'available'].includes(update.state), click: () => { void check() } },
        ...(update.state === 'available' ? [{ label: zh() ? '下载更新…' : 'Download update…', click: () => { void offerDownload() } }] : []),
        ...(update.state === 'downloading' ? [{ label: `${zh() ? '正在下载更新' : 'Downloading update'} ${Math.floor(update.percent)}%`, enabled: false }] : []),
        { label: zh() ? '重启并更新' : 'Restart and update', enabled: update.state === 'downloaded', click: () => { void restart() } },
      ]
    },
    setLanguage(lang) { language = lang },
    startup(lang) { language = lang; if (!started) { started = true; void update.check() } },
    suspend() { update.suspend() },
  }
}
