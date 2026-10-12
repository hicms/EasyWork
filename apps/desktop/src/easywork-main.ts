/** Minimal personal Electron carrier for the bundled EasyWork release Profile. */
import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, session, shell, Tray, type IpcMainInvokeEvent } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { uptime } from 'node:os'
import { fileURLToPath } from 'node:url'
import { startupErrorHtml } from './startup-surface.ts'
import { CarrierWeb, officialFrontendDirectory } from './carrier-web.ts'
import { APP_ORIGIN, APP_SCHEME, APP_URL, BOOT_IPC, PRODUCT_NAME, USER_DATA_DIRECTORY_NAME } from './startup-contract.ts'
import { materializeRuntimeProfile, markProfileUpdated, officialLauncher, officialHostLauncher } from './local-runtime.ts'
import { manageCommand } from './command-management.ts'
import { cleanOwnedProcessTree, stopOwnedProcess, markWindowsJobProcess } from './owned-process.ts'
import { windowsJobArguments } from './windows-process-job.ts'
import { watchRuntimeShutdown, stopRuntimeProcess } from './runtime-shutdown.ts'
import { StartupLog, startupErrorFields } from './startup-log.ts'
import { runtimeProfileDirectory } from './runtime-layout.ts'
import { syncWindowChrome, windowChromeOptions } from './window-chrome.ts'
import { installWindowMenu } from './window-menu.ts'
import { installKeyboard } from './keyboard.ts'

const PROFILE_NAME = 'easywork'

let runtime: ChildProcess | undefined
let window: BrowserWindow | undefined
let keyboard: Awaited<ReturnType<typeof installKeyboard>> | undefined
let windowHidden = false
let starting = false
let stopping = false
let quitting = false
let quitRequested = false
let installer: ChildProcess | undefined
let web: CarrierWeb | undefined
let tray: Tray | undefined
let log: StartupLog | undefined
let startupComplete = false
let loadingObserved = false
let loadingArc = 0
let finishPlugins: (() => void) | undefined
let heartbeat: ReturnType<typeof setInterval> | undefined
let stopRuntimeOutput: (() => void) | undefined
const errorWindows = new WeakSet<BrowserWindow>()
const errorNavigations = new WeakMap<BrowserWindow, Promise<void>>()

function bundledProfileDirectory(): string {
  const overridden = process.env.EASYWORK_BUNDLED_PROFILE
  if (overridden !== undefined && overridden.length > 0) return overridden
  return runtimeProfileDirectory(join(process.resourcesPath, 'easywork-runtime'))
}

function runtimeHome(): string {
  const overridden = process.env.EASYWORK_DSH_HOME
  if (overridden !== undefined && overridden.length > 0) return overridden
  return join(app.getPath('userData'), 'dsh-home')
}

function bundledNodeExecutable(): string {
  const overridden = process.env.EASYWORK_NODE_EXECUTABLE
  if (overridden !== undefined && overridden.length > 0) return overridden
  return join(
    bundledPrimaryRuntime(),
    'dependencies',
    'node',
    'bin',
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
}

function bundledPrimaryRuntime(): string {
  const overridden = process.env.EASYWORK_PRIMARY_RUNTIME
  if (overridden !== undefined && overridden.length > 0) return overridden
  return join(process.resourcesPath, 'easywork-runtime', 'primary-runtime')
}

function browserWorkerRequest(): { port: number, profile: string } | undefined {
  const portArg = process.argv.find(arg => arg.startsWith('--easywork-browser-worker-port='))
  if (portArg === undefined) return undefined
  const port = Number(portArg.slice('--easywork-browser-worker-port='.length))
  const profile = process.argv.find(arg => arg.startsWith('--easywork-browser-worker-profile='))
    ?.slice('--easywork-browser-worker-profile='.length)
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !profile || !isAbsolute(profile) || !existsSync(profile)) {
    throw new Error('Invalid EasyWork browser worker arguments')
  }
  return { port, profile }
}

function startBrowserWorker(request: { port: number, profile: string }): void {
  // Set this before Electron becomes ready: hiding the Dock afterwards briefly
  // registers every task's browser worker as another foreground application.
  // Accessory permits the hidden browser window without a Dock icon or menu bar.
  if (process.platform === 'darwin') app.setActivationPolicy('accessory')
  app.setPath('userData', request.profile)
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  app.commandLine.appendSwitch('remote-debugging-port', String(request.port))
  void app.whenReady().then(async () => {
    const page = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    })
    page.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await page.loadURL('about:blank')
    process.stdout.write('EASYWORK_BROWSER_WORKER_READY\n')
  }).catch(error => {
    process.stderr.write(`EasyWork browser worker failed: ${String(error)}\n`)
    app.exit(1)
  })
}

function restoreWindow(): void {
  if (quitting || quitRequested) return
  const page = window
  if (!page || page.isDestroyed()) {
    if (web) void openWindow().catch(error => { void showStartupError(String(error)) })
    return
  }
  windowHidden = false
  if (page.isMinimized()) page.restore()
  page.show()
  page.focus()
}

async function openWindow(): Promise<void> {
  if (window && !window.isDestroyed()) { restoreWindow(); return }
  const page = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    title: PRODUCT_NAME,
    icon: fileURLToPath(new URL('../build/app-icon.png', import.meta.url)),
    backgroundColor: '#111113',
    ...windowChromeOptions(),
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: fileURLToPath(new URL('./startup-preload.cjs', import.meta.url)) },
  })
  window = page
  syncWindowChrome(page)
  keyboard!.attach(page)
  windowHidden = false
  log!.write('window.created')
  page.on('show', () => { log!.write('window.shown') })
  const loaded = log!.stage('renderer.document')
  page.webContents.on('did-start-navigation', (_event, url, inPlace, isMainFrame) => {
    if (!isMainFrame || inPlace || !url.startsWith(APP_ORIGIN + '/')) return
    startupComplete = false; loadingObserved = false; loadingArc = 0
    finishPlugins = log!.stage('renderer.plugins')
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = setInterval(() => { log!.heartbeat({ loadingObserved, loadingArc, windowHidden }) }, 5000).unref()
  })
  page.webContents.on('console-message', details => {
    if (!startupComplete && ['warning', 'error'].includes(details.level)) log!.output('renderer.console.' + details.level, details.message)
  })
  page.webContents.on('preload-error', (_event, _path, error) => { log!.write('renderer.preload-failed', startupErrorFields(error)) })
  page.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => { log!.write('renderer.load-failed', { code, isMainFrame }) })
  page.webContents.on('render-process-gone', (_event, details) => { log!.write('renderer.gone', { reason: details.reason, exitCode: details.exitCode }) })
  page.on('unresponsive', () => { log!.write('renderer.unresponsive') })
  page.on('responsive', () => { log!.write('renderer.responsive') })
  page.on('page-title-updated', event => { event.preventDefault(); page.setTitle(PRODUCT_NAME) })
  page.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('https://') || target.startsWith('http://')) void shell.openExternal(target)
    return { action: 'deny' }
  })
  page.webContents.on('will-navigate', (event, target) => {
    try { const url = new URL(target); if (url.protocol === `${APP_SCHEME}:` && url.host === 'app') return } catch { /* refuse invalid navigation */ }
    event.preventDefault()
  })
  page.on('close', event => {
    if (quitting) return
    event.preventDefault()
    windowHidden = true
    if (process.platform === 'darwin' && page.isFullScreen()) {
      page.once('leave-full-screen', () => { if (!page.isDestroyed()) page.hide() })
      page.setFullScreen(false)
    } else page.hide()
  })
  page.on('session-end', () => { app.quit() })
  page.on('closed', () => { if (window === page) { window = undefined; if (heartbeat) clearInterval(heartbeat) } })
  try {
    // Acknowledge launch immediately; the official document and Host load in this same window.
    page.show()
    await page.loadURL(APP_URL)
    loaded()
  } catch (error) {
    loaded(startupErrorFields(error))
    // A failed Host may replace the first document before its navigation settles.
    // ERR_ABORTED then belongs to the replacement, not to a broken window.
    if (errorWindows.has(page)) return
    if (!page.isDestroyed()) page.destroy()
    throw error
  }
}

async function showStartupError(message: string): Promise<void> {
  log?.output('startup.failed', message)
  if (heartbeat) clearInterval(heartbeat)
  if (quitting || quitRequested) return
  const page = window
  if (page && !page.isDestroyed()) {
    const existing = errorNavigations.get(page)
    if (existing) return existing
    errorWindows.add(page)
    const navigation = Promise.resolve().then(async () => {
      try { await page.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(startupErrorHtml(message))); page.show() }
      catch { dialog.showErrorBox('工作区启动失败', message); app.quit() }
    })
    errorNavigations.set(page, navigation)
    web?.fail(new Error(message))
    try { await navigation } finally { errorNavigations.delete(page) }
    return
  }
  web?.fail(new Error(message))
  dialog.showErrorBox('工作区启动失败', message)
  app.quit()
}

function runtimeEnvironment(home: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DSH_HOME: home,
    DSH_AGENTS_HOME: join(home, 'agents'),
    DSH_BUNDLED_PRIMARY_RUNTIME: bundledPrimaryRuntime(),
    DSH_ELECTRON_EXECUTABLE: process.execPath,
    EASYWORK_ELECTRON_APP_PATH: app.isPackaged ? undefined : app.getAppPath(),
    ELECTRON_RUN_AS_NODE: '1',
  }
}

async function officialCommand(home: string, args: string[], timeoutMs = 240_000): Promise<void> {
  const installed = log!.stage('profile.install')
  const executable = bundledNodeExecutable()
  const launcher = officialLauncher(bundledProfileDirectory(), home, executable, join(bundledPrimaryRuntime(), 'dependencies', 'pnpm', 'bin', 'pnpm.cjs'))
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--expose-internals', ...windowsJobArguments(bundledProfileDirectory(), home), launcher, ...args], { env: runtimeEnvironment(home), cwd: home, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    markWindowsJobProcess(child)
    installer = child
    let settled = false
    const timer = setTimeout(() => { void stopOwnedProcess(child).then(() => finish(new Error('官方插件安装超时，请检查网络后重试')), finish) }, timeoutMs)
    function finish(error?: Error): void {
      if (settled) return
      settled = true; clearTimeout(timer)
      installed(error ? startupErrorFields(error) : {})
      if (installer === child) installer = undefined
      void cleanOwnedProcessTree(child).then(() => error ? reject(error) : resolve(), reject)
    }
    log!.capture(child.stdout, 'installer.stdout', () => !startupComplete)
    log!.capture(child.stderr, 'installer.stderr', () => !startupComplete)
    child.once('error', () => finish(new Error('无法启动官方插件安装工具')))
    child.once('exit', code => finish(quitRequested ? new Error('插件安装已取消') : code === 0 ? undefined : new Error(`官方插件操作失败 (${code})；请核对插件版本和网络`)))
  })
}

async function prepareProfile(home: string): Promise<void> {
  const prepared = log!.stage('profile.prepare')
  try {
    const source = bundledProfileDirectory()
    const result = materializeRuntimeProfile(source, home)
    log!.write('profile.materialized', { needsInstall: result.changed })
    if (result.changed) {
      if (quitRequested) { prepared({ cancelled: true }); return }
      await officialCommand(home, ['plugin', '--profile', PROFILE_NAME, 'install'])
      markProfileUpdated(source, result.profile)
    }
    if (!quitRequested) officialLauncher(source, home, bundledNodeExecutable(), join(bundledPrimaryRuntime(), 'dependencies', 'pnpm', 'bin', 'pnpm.cjs'))
    prepared()
  } catch (error) {
    prepared(startupErrorFields(error))
    throw error
  }
}

function rememberCommandSpace(home: string): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(join(app.getPath('userData'), 'command-context.json'), JSON.stringify({ personalHome: home }), { mode: 0o600 })
}

function startRuntime(home: string): void {
  const hostReady = log!.stage('host.start')
  rememberCommandSpace(home)
  const executable = bundledNodeExecutable()
  if (!existsSync(executable)) throw new Error(`Bundled Node.js runtime is missing: ${executable}`)
  const basePatch = join(bundledProfileDirectory(), 'cordis.patch.yml')
  const layers = existsSync(basePatch) ? [basePatch] : []
  const traceDirectory = existsSync(join(app.getPath('userData'), 'logs', 'startup-trace.enabled')) ? join(app.getPath('userData'), 'logs') : undefined
  const launcher = officialHostLauncher(bundledProfileDirectory(), home, executable, join(bundledPrimaryRuntime(), 'dependencies', 'pnpm', 'bin', 'pnpm.cjs'), layers, traceDirectory)
  const child = spawn(process.execPath, ['--expose-internals', ...windowsJobArguments(bundledProfileDirectory(), home), launcher, '--no-open'], {
    env: runtimeEnvironment(home), cwd: home, detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  })
  markWindowsJobProcess(child)
  runtime = child
  log!.write('host.spawned', { childPid: child.pid })
  watchRuntimeShutdown(child)
  let ready = false
  let runtimeStopping = false
  const readyTimeout = setTimeout(() => {
    if (ready || runtime !== child || quitting || quitRequested) return
    runtimeStopping = true
    log!.write('host.timeout')
    void stopRuntimeProcess(child).then(() => {
      if (runtime === child) runtime = undefined
      return showStartupError('官方 DSH 尚未就绪，已停止本机进程。')
    }).catch(error => { void showStartupError(String(error instanceof Error ? error.message : error)) })
  }, 90_000)
  const stopStdout = log!.capture(child.stdout!, 'host.stdout', () => !startupComplete)
  const stopStderr = log!.capture(child.stderr!, 'host.stderr', () => !startupComplete)
  stopRuntimeOutput = () => { stopStdout(); stopStderr() }
  child.on('message', (message: unknown) => {
    if (ready || runtimeStopping || quitting || quitRequested || runtime !== child) return
    if (message && typeof message === 'object' && 'type' in message && message.type === 'easywork-startup-phase') {
      if ('stage' in message && typeof message.stage === 'string' && ['runtime.import', 'profile.resolve', 'plugins.activate'].includes(message.stage)
        && 'state' in message && typeof message.state === 'string' && ['begin', 'end'].includes(message.state) && 'durationMs' in message
        && typeof message.durationMs === 'number' && Number.isFinite(message.durationMs) && message.durationMs >= 0 && message.durationMs <= 240_000) {
        log!.write('host.' + message.stage + '.' + message.state, { durationMs: message.durationMs })
      }
      return
    }
    if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'easywork-ready'
      || !('url' in message) || typeof message.url !== 'string' || !('injections' in message) || !Array.isArray(message.injections)) {
      void showStartupError('本机 DSH 返回了无效的启动消息')
      return
    }
    ready = true
    hostReady({ injections: message.injections.length })
    const connected = log!.stage('transport.authenticate')
    void web!.connect(message.url, message.injections).then(() => {
      connected()
      if (runtime !== child || quitting || quitRequested) return
      clearTimeout(readyTimeout)
    }).catch(error => { connected(startupErrorFields(error)); void showStartupError(error instanceof Error ? error.message : String(error)) })
  })
  child.once('error', cause => {
    log!.write('host.error', startupErrorFields(cause))
    clearTimeout(readyTimeout)
    if (runtime === child) { runtime = undefined; void showStartupError(cause.message) }
  })
  child.once('exit', (code, signal) => {
    log!.write('host.exit', { code, signal })
    clearTimeout(readyTimeout)
    // The shutdown monitor waits for disposal acknowledgement and the stdio close.
    if (runtime !== child || runtimeStopping || quitRequested || quitting) return
    const message = ready ? `官方 DSH 进程已退出 (${code})` : '官方 DSH 未能完成启动，请检查插件版本和 Profile 配置。'
    void cleanOwnedProcessTree(child).then(() => {
      if (runtime !== child) return
      runtime = undefined
      return showStartupError(message)
    }).catch(error => {
      void showStartupError(`${message}\n${error instanceof Error ? error.message : String(error)}`)
    })
  })
}

async function startPersonalWorkspace(): Promise<void> {
  starting = true
  try {
    web = new CarrierWeb(officialFrontendDirectory(bundledProfileDirectory()), log!, () => !startupComplete)
    installTransport()
    void openWindow().catch(error => { void showStartupError(String(error)); app.quit() })
    if (quitRequested) return
    const home = runtimeHome()
    await prepareProfile(home)
    if (!quitRequested) startRuntime(home)
  } catch (error) {
    await showStartupError(error instanceof Error ? error.message : String(error))
  } finally {
    starting = false
    if (quitRequested) app.quit()
  }
}

function installMenu(): void {
  installWindowMenu({ currentWindow: () => window, restore: restoreWindow, assertSender: assertStartupSender,
    edit: (keyCode, modifiers) => { keyboard!.sendEditingKey(keyCode, modifiers) },
    command: () => { void manageCommand(join(process.resourcesPath, 'easywork-runtime'), '个人工作区') } })
  installTray()
}

function installTray(): void {
  if (process.platform !== 'darwin' && !tray) {
    tray = new Tray(fileURLToPath(new URL('../build/tray-icon-blue.png', import.meta.url)))
    tray.setToolTip(PRODUCT_NAME)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: `打开 ${PRODUCT_NAME}`, click: restoreWindow },
      { label: `退出 ${PRODUCT_NAME}`, click: () => { app.quit() } },
    ]))
    tray.on('click', restoreWindow)
  }
}

function cancelQuit(error: unknown): void {
  stopping = false
  quitRequested = false
  installTray()
  void showStartupError(error instanceof Error ? error.message : '本机进程停止尚未确认，请稍后重试。')
}

function assertStartupSender(event: IpcMainInvokeEvent): void {
  if (!window || window.isDestroyed() || event.sender !== window.webContents
    || event.senderFrame === null || event.senderFrame !== event.sender.mainFrame
    || !event.senderFrame.url.startsWith(APP_ORIGIN + '/')) throw new Error('无权访问工作区启动接口')
}

function installTransport(): void {
  protocol.handle(APP_SCHEME, request => web!.request(request))
  ipcMain.handle(BOOT_IPC.ready, async event => {
    assertStartupSender(event)
    const ready = log!.stage('renderer.boot-bridge')
    try { const boot = await web!.ready(); ready({ injections: boot.injections.length }); return boot }
    catch (error) { ready(startupErrorFields(error)); throw error }
  })
  ipcMain.handle(BOOT_IPC.progress, (event, progress: unknown) => {
    assertStartupSender(event)
    if (!progress || typeof progress !== 'object' || !('loading' in progress) || typeof progress.loading !== 'boolean'
      || !('arc' in progress) || typeof progress.arc !== 'number' || !Number.isFinite(progress.arc)
      || progress.arc < 0 || progress.arc > 288) throw new Error('无效的页面加载进度')
    if (startupComplete) return
    if (progress.loading) loadingObserved = true
    else if (!loadingObserved) return
    loadingArc = progress.arc
    log!.write('renderer.loading', { loading: progress.loading, arc: progress.arc })
    if (!progress.loading) {
      startupComplete = true
      stopRuntimeOutput?.()
      finishPlugins?.()
      if (heartbeat) clearInterval(heartbeat)
      log!.write('startup.complete')
      void log!.flush()
    }
  })
  ipcMain.handle(BOOT_IPC.failed, (event, message: unknown) => {
    assertStartupSender(event)
    if (typeof message !== 'string' || message.length > 16_384) throw new Error('无效的页面启动错误')
    return showStartupError(message)
  })
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['ws://127.0.0.1/*'] }, (details, callback) => {
    if (!web!.ownsStream(details.url)) { callback({}); return }
    if (details.webContentsId !== window?.webContents.id) { callback({ cancel: true }); return }
    const headers = web!.streamHeaders(details.url, details.requestHeaders)
    callback(headers ? { requestHeaders: headers } : { cancel: true })
  })
}

const worker = browserWorkerRequest()
if (worker !== undefined) {
  startBrowserWorker(worker)
} else {
  if (process.platform === 'darwin') app.setActivationPolicy('regular')
  const desktopUserData = process.env.EASYWORK_DESKTOP_USER_DATA || join(app.getPath('appData'), USER_DATA_DIRECTORY_NAME)
  if (!isAbsolute(desktopUserData)) throw new Error('Desktop user data override must be absolute')
  mkdirSync(desktopUserData, { recursive: true })
  app.setPath('userData', desktopUserData)
  app.setName(PRODUCT_NAME)
  if (!app.requestSingleInstanceLock()) {
    app.quit()
  } else {
    log = new StartupLog(desktopUserData)
    log.write('app.start', { version: app.getVersion(), packaged: app.isPackaged, osUptimeSeconds: Math.floor(uptime()) })
    process.on('uncaughtExceptionMonitor', error => { log!.crash(error) })
    app.on('quit', () => { if (heartbeat) clearInterval(heartbeat) })
    protocol.registerSchemesAsPrivileged([{ scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }])
    app.on('second-instance', restoreWindow)
    app.on('before-quit', event => {
      if (quitting) return
      event.preventDefault()
      quitRequested = true
      log!.write('app.quit-requested')
      if (heartbeat) clearInterval(heartbeat)
      // Acknowledge the click immediately while the Host finishes its disposal.
      windowHidden = true
      if (window && !window.isDestroyed()) window.hide()
      tray?.destroy()
      tray = undefined
      web?.fail(new Error('工作区正在退出'))
      if (starting) {
        if (installer) void stopOwnedProcess(installer).catch(cancelQuit)
        return
      }
      if (stopping) return
      stopping = true
      const child = runtime
      void (child ? stopRuntimeProcess(child) : Promise.resolve()).then(async result => {
        if (result) { log!.write('host.stopped', { result }); process.stderr.write(`EasyWork Host stopped: ${result}\n`) }
        runtime = undefined
        log!.write('app.quit')
        await log!.flushForQuit()
        quitting = true
        app.quit()
      }).catch(cancelQuit)
    })
    app.on('window-all-closed', () => {
      if (!tray && process.platform !== 'darwin') app.quit()
    })
    app.on('activate', () => {
      restoreWindow()
    })
    app.on('will-quit', () => { keyboard?.dispose() })
    void app.whenReady().then(async () => {
      log!.write('app.ready')
      keyboard = await installKeyboard(bundledProfileDirectory(), app.getPath('userData'), () => window, assertStartupSender)
      installMenu(); await startPersonalWorkspace()
    }).catch(cause => {
      log!.write('app.start-failed', startupErrorFields(cause))
      process.stderr.write(`EasyWork failed to start: ${cause instanceof Error ? cause.stack ?? cause.message : String(cause)}\n`)
      app.quit()
    })
  }
}
