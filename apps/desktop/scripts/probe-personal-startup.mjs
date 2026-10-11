/** Explicit real Electron probe: direct personal startup, retained data and restart. */
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, mkdir, rm, copyFile, symlink, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtime = resolve(process.argv[2]), built = resolve(process.argv[3]), output = resolve(process.argv[4])
const profile = join(runtime, 'profiles/easywork')
const { _electron } = createRequire(import.meta.url)(resolve(process.env.EASYWORK_PLAYWRIGHT_ENTRY))
const electron = createRequire(join(root, 'package.json'))('electron')
const owned = await mkdtemp(join(tmpdir(), 'easywork-personal-startup-'))
const home = join(owned, 'personal'), browser = join(owned, 'browser')
await mkdir(browser, { mode: 0o700 })
await mkdir(home, { mode: 0o700 })
await writeFile(join(home, 'cordis.patch.yml'), '- id: webserver\n  config:\n    host: 127.0.0.1\n    port: 0\n')
const packaged = Boolean(process.env.EASYWORK_PACKAGED_EXECUTABLE)
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|TOKEN|PASSWORD|SECRET|^DSH_|^EASYWORK_|^NODE_OPTIONS$|^NODE_PATH$/iu.test(key)))
await access(built)
const isolatedProfile = join(owned, 'bundle/profiles/easywork')
if (!packaged) {
  await mkdir(isolatedProfile, { recursive: true })
  for (const name of ['package.json', 'profile-installation.json', 'pnpm-workspace.yaml', '.easywork-desktop-release.json']) {
    await copyFile(join(profile, name), join(isolatedProfile, name))
  }
  await symlink(join(profile, 'node_modules'), join(isolatedProfile, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  await copyFile(join(profile, 'cordis.patch.yml'), join(isolatedProfile, 'cordis.patch.yml'))
}
const options = {
  executablePath: process.env.EASYWORK_PACKAGED_EXECUTABLE ?? electron,
  args: packaged ? [] : [root],
  env: { ...cleanEnvironment, HOME: owned, EASYWORK_DESKTOP_USER_DATA: browser, EASYWORK_DSH_HOME: home,
    ...packaged ? {} : { EASYWORK_BUNDLED_PROFILE: isolatedProfile, EASYWORK_PRIMARY_RUNTIME: join(runtime, 'primary-runtime'),
      EASYWORK_NODE_EXECUTABLE: join(runtime, 'primary-runtime/dependencies/node/bin', process.platform === 'win32' ? 'node.exe' : 'node') },
    EASYWORK_ENTERPRISE_PORTAL: 'https://ignored.invalid' },
  timeout: 30000,
}
async function personalPage(app) {
  const until = Date.now() + 90000
  while (Date.now() < until) {
    const page = app.windows().find(page => page.url().startsWith('easywork-app://app/'))
    if (page) { await page.waitForFunction(() => Boolean(window.__DSH_BOOT__), null, { timeout: Math.max(1, until - Date.now()) }); return page }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Personal workspace did not open automatically')
}
let app, appProcess, proof, failed = false
const diagnostics = []
const mainLog = join(owned, 'carrier-diagnostics.log')
async function captureDiagnostics(instance) {
  instance.process().stderr.on('data', chunk => { diagnostics.push(chunk.toString().replace(/\?token=[^\s]+/gu, '?token=[redacted]')) })
  // Packaged Windows GUI executables do not reliably expose inherited stderr.
  // Collect the carrier's already-redacted writes inside this isolated test only.
  await instance.evaluate((_electron, path) => {
    const fs = process.getBuiltinModule('node:fs'), write = process.stderr.write.bind(process.stderr)
    process.stderr.write = (...args) => {
      fs.appendFileSync(path, String(args[0]).replace(/\?token=[^\s]+/gu, '?token=[redacted]'))
      return write(...args)
    }
  }, mainLog)
}
async function quitApplication(instance, requireGracefulHost = true) {
  const child = instance.process(), diagnosticStart = (await readFile(mainLog, 'utf8').catch(() => '')).length
  let timer
  const exited = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Explicit application quit timed out')), 15_000)
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }) })
  })
  // Browser.close can destroy the document before the carrier's before-quit handler.
  // Exercise the same app.quit path as the product's menu, with a bounded process wait.
  try {
    await Promise.race([
      instance.evaluate(({ app }) => { setImmediate(() => { app.quit() }) }),
      exited.then(() => undefined),
    ])
    assert.deepEqual(await exited, { code: 0, signal: null })
    const recorded = (await readFile(mainLog, 'utf8').catch(() => '')).slice(diagnosticStart)
    if (requireGracefulHost) assert.ok(recorded.includes('EasyWork Host stopped: graceful'), 'Official disposal was not confirmed')
  } finally { clearTimeout(timer) }
}
try {
  const started = Date.now()
  app = await _electron.launch(options)
  appProcess = app.process()
  await captureDiagnostics(app)
  const firstDocument = await app.firstWindow()
  const pageErrors = []
  firstDocument.on('pageerror', error => { pageErrors.push(error.message) })
  const firstDocumentMs = Date.now() - started
  await firstDocument.waitForURL(/^easywork-app:\/\/app\/(?:\?.*)?$/u, { waitUntil: 'domcontentloaded' })
  const visibleUntil = Date.now() + 30_000
  while (!await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible())) {
    if (Date.now() > visibleUntil) throw new Error('Official document did not become visible')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  const firstVisibleMs = Date.now() - started
  const personal = await personalPage(app)
  const bootReadyMs = Date.now() - started
  const entries = await personal.evaluate(() => window.__DSH_BOOT__.entries.map(entry => entry.id))
  assert.ok(!entries.some(name => /identity-enterprise|enterprise-collaboration/u.test(name)))
  for (const name of ['experts', 'skills', 'library', 'connectors', 'projects']) assert.ok(entries.includes('easywork-plugin-' + name))
  assert.equal(await personal.getByRole('heading', { name: '选择使用方式' }).count(), 0)
  assert.equal(await personal.getByRole('button', { name: '登录企业账号', exact: true }).count(), 0)
  const menu = await app.evaluate(({ Menu }) => Menu.getApplicationMenu().items.map(item => item.label))
  assert.ok(!menu.some(label => /企业|切换使用方式/u.test(label)))
  await personal.getByText('项目', { exact: true }).first().waitFor({ timeout: 30_000 })
  const startupMs = Date.now() - started
  const skipKey = personal.getByRole('button', { name: '稍后配置', exact: true })
  await skipKey.waitFor({ state: 'visible', timeout: 10_000 })
  assert.equal(await personal.getByRole('heading', { name: '预览版说明', exact: true }).count(), 0)
  await skipKey.click()
  await skipKey.waitFor({ state: 'hidden', timeout: 10_000 })
  const navigation = personal.getByRole('navigation', { name: /^(全局面板|Global panels)$/u })
  for (const [label, search] of [['专家', '搜索专家'], ['技能', '搜索技能'], ['连接器', '搜索 MCP']]) {
    await navigation.getByRole('button', { name: label, exact: true }).click()
    await personal.getByRole('textbox', { name: search, exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
  }
  await personal.getByText('资料库', { exact: true }).first().click()
  await personal.getByRole('heading', { name: '让知识，随时可用。', exact: true }).waitFor({ timeout: 10_000 })
  await personal.getByText('项目', { exact: true }).first().click()
  await personal.waitForFunction(() => new URL(location.href).searchParams.get('easywork-view') === 'projects')
  const projectOperation = await personal.evaluate(async () => {
    const call = async (endpoint, payload) => {
      const response = await fetch('/api/easywork-projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }) })
      const result = await response.json()
      if (!result.ok) throw new Error('Project operation failed: ' + endpoint)
      return result.value
    }
    const created = await call('create', { name: 'Startup probe ' + Date.now() })
    const id = created.project.id
    await call('get', { projectId: id })
    await call('archive', { projectId: id })
    return Boolean(id)
  })
  assert.equal(projectOperation, true)
  await personal.screenshot({ path: output.replace(/\.json$/u, '.png') })
  const identity = await personal.evaluate(() => { window.__easyworkReopenProbe = 'same-document'; return window.__DSH_BOOT__ })
  const port = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getURL())
  assert.match(port, /^easywork-app:\/\/app\/(?:\?.*)?$/u)
  const closed = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]; window.close(); return { destroyed: window.isDestroyed(), visible: window.isVisible() }
  })
  assert.deepEqual(closed, { destroyed: false, visible: false })
  const reopenStarted = Date.now()
  await app.evaluate(({ app }) => { app.emit('second-instance') })
  assert.equal(await personal.evaluate(() => window.__easyworkReopenProbe), 'same-document')
  assert.deepEqual(await personal.evaluate(() => window.__DSH_BOOT__), identity)
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), true)
  assert.deepEqual(pageErrors, [])
  const reopenMs = Date.now() - reopenStarted
  await writeFile(join(home, 'retention-probe.txt'), 'owned-test-data')
  const oldOrigin = await personal.evaluate(() => window.__DSH_TRANSPORT__.streamBaseUrl)
  await quitApplication(app); app = undefined
  assert.equal(await fetch(oldOrigin, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false), false)
  app = await _electron.launch(options)
  appProcess = app.process()
  await captureDiagnostics(app)
  const restarted = await personalPage(app)
  await restarted.getByText('项目', { exact: true }).first().waitFor({ timeout: 30_000 })
  await restarted.getByRole('button', { name: '稍后配置', exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
  assert.equal(await restarted.getByRole('heading', { name: '预览版说明', exact: true }).count(), 0)
  assert.equal(await readFile(join(home, 'retention-probe.txt'), 'utf8'), 'owned-test-data')
  await quitApplication(app); app = undefined
  // Reproduce a failed Host that exits before quit. The carrier must release its
  // instance lock instead of treating taskkill's missing PID as a cleanup failure.
  const homePatch = await readFile(join(home, 'cordis.patch.yml'), 'utf8')
  await writeFile(join(home, 'cordis.patch.yml'), '[invalid yaml\n')
  app = await _electron.launch(options)
  appProcess = app.process()
  await captureDiagnostics(app)
  const failedPage = await app.firstWindow()
  await failedPage.getByRole('status').filter({ hasText: '工作区启动失败' }).waitFor({ timeout: 30_000 })
  const failedText = await failedPage.locator('body').innerText()
  assert.ok(!failedText.includes('Windows 本机进程树清理未确认'))
  await failedPage.screenshot({ path: output.replace(/\.json$/u, '.failure-recovered.png') })
  await quitApplication(app, false); app = undefined
  await writeFile(join(home, 'cordis.patch.yml'), homePatch)
  app = await _electron.launch(options)
  appProcess = app.process()
  await captureDiagnostics(app)
  const recovered = await personalPage(app)
  await recovered.getByText('项目', { exact: true }).first().waitFor({ timeout: 30_000 })
  assert.equal(await readFile(join(home, 'retention-probe.txt'), 'utf8'), 'owned-test-data')
  await quitApplication(app); app = undefined
  proof = { actualElectron: true, directPersonalStartup: true, noModePickerOrEnterprise: true,
    fiveFeatureManifestPresent: true, fiveFeatureUiOpened: true, personalHostStoppedOnQuit: true, ownedHomeDataPreserved: true,
    personalRestart: true, failedHostQuitAndRestart: true, previewNoticeSuppressed: true, projectCreateReadArchive: true, sameDocumentReopen: true, closeKeepsHost: true,
    firstDocumentMs, firstVisibleMs, bootReadyMs, reopenMs,
    startupMs, modelCallsRequested: 0, packagedRuntimeVerified: packaged }
} catch (error) {
  failed = true
  const pages = app?.windows() ?? []
  const rendered = await Promise.all(pages.map(async page => ({ url: page.url(), text: await page.locator('body').innerText({ timeout: 2000 }).catch(() => '') })))
  await mkdir(dirname(output), { recursive: true })
  diagnostics.push((await readFile(mainLog, 'utf8').catch(() => '')).slice(-50_000))
  await writeFile(output.replace(/\.json$/u, '.failure.json'), JSON.stringify({ ok: false, error: error.message, ownedDiagnostics: mainLog, rendered, diagnostics }, null, 2))
  throw error
} finally {
  if (app && appProcess?.exitCode === null) await quitApplication(app).catch(async error => {
    console.error('Probe cleanup failed:', error.message)
    if (failed) {
      const file = output.replace(/\.json$/u, '.failure.json')
      const primary = JSON.parse(await readFile(file, 'utf8'))
      await writeFile(file, JSON.stringify({ ...primary, cleanupError: error.message }, null, 2))
    }
  })
  if (!failed) await rm(owned, { recursive: true, force: true })
}
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify({ ...proof, gracefulAppExitVerified: true }, null, 2))
console.log('PASS: automatic personal Desktop startup, Host stop, retained data and restart')
