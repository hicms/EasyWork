/** Destructive installation acceptance only on fresh, disposable GitHub-hosted Windows runners. */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { extractFile, uncache } from '@electron/asar'
import { CURRENT_APP_INSTALLER_FILE_NAME } from 'builder-util-runtime'
import { readReleaseManifest, verifyReleaseSource } from '../../../scripts/desktop-release-policy.mjs'
import { newerVersion } from '../src/update-policy.ts'
import { hashFile } from './verify-update-artifacts.mjs'
import { startUpdateAcceptanceServer } from './update-acceptance-server.mjs'

if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
  throw new Error('Real installation acceptance requires a disposable GitHub-hosted Windows runner; never run on a personal workstation')
}
const root = resolve(process.env.RUNNER_TEMP, 'easywork-update'), output = join(root, 'evidence')
const appDirectory = join(root, 'app'), appExecutable = join(appDirectory, 'EasyWork.exe')
const home = join(process.env.APPDATA, 'EasyWork')
if (existsSync(home) || existsSync(appDirectory)) throw new Error('Requires a fresh runner without an existing EasyWork installation or Home')
mkdirSync(output, { recursive: true })
const mode = 'unsigned-acceptance', scenario = process.env.UPDATE_SCENARIO
assert(['delta', 'missing-cache', 'corrupt-blockmap', 'offline'].includes(scenario))
const baselineDirectory = join(root, 'A'), candidateDirectory = join(root, 'B')
const baseline = readReleaseManifest(join(baselineDirectory, 'release.json'), mode)
const candidate = readReleaseManifest(join(candidateDirectory, 'release.json'), mode)
const legacyDirectory = join(root, 'legacy')
const legacy = scenario === 'delta' ? JSON.parse(readFileSync(join(legacyDirectory, 'acceptance.json'), 'utf8')) : undefined
if (legacy) {
  assert.equal(legacy.version, '2.0.6-alpha.5'); assert.equal(legacy.sourceCommit, 'e86ed553b9a88daed87be95f82b437abde76993c')
  const file = join(legacyDirectory, `EasyWork-${legacy.version}-x64-Setup.exe`)
  assert.equal(statSync(file).size, 272156747)
  assert.equal(await hashFile(file, 'sha256', 'hex'), 'd76cbbc92f40a8ca28d51fe17f6c18b0738e2bb6cfc84aa30214fb6e6f060103')
}
assert(newerVersion(candidate.version, baseline.version)); assert.equal(candidate.updaterCacheDirName, baseline.updaterCacheDirName)
assert.match(baseline.updaterCacheDirName, /^[a-zA-Z\d._-]+$/u)
for (const [release, directory] of [[baseline, baselineDirectory], [candidate, candidateDirectory]]) {
  verifyReleaseSource({ commit: release.sourceCommit, version: release.version, channel: release.channel,
    defaultBranch: process.env.DEFAULT_BRANCH, root: process.cwd() })
  for (const asset of release.assets) {
    assert.equal(statSync(join(directory, asset.name)).size, asset.size)
    assert.equal(await hashFile(join(directory, asset.name), 'sha256', 'hex'), asset.sha256)
  }
}
const env = { ...process.env }
for (const name of Object.keys(env)) if (/TOKEN|PASSWORD|SECRET|^CSC_|^WIN_CSC_|^NODE_OPTIONS$|^NODE_PATH$|^EASYWORK_|^DSH_/u.test(name)) delete env[name]
env.DSH_TELEMETRY_DISABLED = '1'
const require = createRequire(new URL('../../web/package.json', import.meta.url))
const { _electron, expect } = require('@playwright/test')
const proof = { sourceCommit: candidate.sourceCommit, baseline: baseline.version, version: candidate.version,
  installerSha512: candidate.installerSha512, scenario, checks: {}, dataScope: ['project', 'local file', 'browser preference'] }
let running, server
const checkpoint = phase => {
  proof.phase = phase
  writeFileSync(join(output, 'acceptance.json'), JSON.stringify(proof, null, 2) + '\n')
  console.log(phase)
}
const waitFor = async (read, description, milliseconds = 180_000) => {
  checkpoint(description)
  const until = Date.now() + milliseconds
  while (Date.now() < until) { const value = await read(); if (value) return value; await delay(1000) }
  throw new Error('Timed out: ' + description)
}
const installedVersion = () => {
  try {
    const archive = join(appDirectory, 'resources/app.asar')
    uncache(archive) // NSIS replaces the archive at the same path.
    return JSON.parse(extractFile(archive, 'package.json')).version
  } catch { return undefined }
}
const logs = () => {
  try { return readFileSync(join(home, 'logs/startup.log'), 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } }) }
  catch { return [] }
}
const launch = async (expected, intercept = true) => {
  checkpoint(`Launch ${expected}`)
  running = await _electron.launch({ executablePath: appExecutable, env, args: ['--lang=zh-CN'], timeout: 180_000 })
  assert.equal(await running.evaluate(({ app }) => app.getVersion()), expected)
  const identity = JSON.parse(extractFile(join(appDirectory, 'resources/app.asar'), 'package.json'))
  const release = expected === legacy?.version ? legacy : expected === baseline.version ? baseline : candidate
  if (release !== legacy) assert.equal(identity.easyworkSourceCommit, release.sourceCommit)
  assert.equal(identity.easyworkUpdateTarget, release === legacy ? 'disabled' : 'nsis-acceptance')
  if (release !== legacy) {
    const profile = JSON.parse(readFileSync(join(appDirectory, 'resources/easywork-runtime/package-cache/release-manifest.json'), 'utf8'))
    assert.equal(profile.sourceCommit, release.sourceCommit); assert.equal(profile.sourceDirty, false)
  }
  assert.equal(await running.evaluate(({ app }) => app.getPath('userData')), home)
  const pid = await running.evaluate(() => process.pid)
  if (intercept) await running.evaluate(({ session }, url) => {
    for (const partition of [session.defaultSession, session.fromPartition('electron-updater')]) {
      partition.webRequest.onBeforeRequest({ urls: ['https://api.github.com/repos/hicms/EasyWork/releases*', 'https://github.com/hicms/EasyWork/releases/download/*'] }, (details, callback) => {
        const requested = new URL(details.url); callback({ redirectURL: url + requested.pathname + requested.search })
      })
    }
  }, server.url)
  const page = await running.firstWindow({ timeout: 180_000 })
  await page.waitForURL('easywork-app://app/**')
  await page.getByText(/^(新会话|New conversation|New chat)$/u).first().waitFor({ timeout: 180_000 })
  await running.evaluate((_, file) => {
    const fs = process.getBuiltinModule('node:fs')
    const host = process._getActiveHandles().find(handle => handle.constructor.name === 'ChildProcess' && handle.connected)
    if (!host) throw new Error('Cannot observe installed Host shutdown')
    const record = data => fs.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), appPid: process.pid, hostPid: host.pid, ...data }) + '\n')
    host.stderr.on('data', chunk => record({ stderr: String(chunk).replace(/([?&](?:token|key|secret)=)[^\s&]+/giu, '$1[redacted]') }))
    host.on('message', message => { if (message?.type === 'easywork-shutdown-complete') record({ event: message.type }) })
    host.on('close', (code, signal) => record({ event: 'close', code, signal }))
  }, join(output, 'host-shutdown.jsonl'))
  return { page, pid }
}
const quit = async (pid, requireGraceful = true) => {
  const close = running.waitForEvent('close', { timeout: 30_000 })
  await running.evaluate(({ app }) => { setImmediate(() => app.quit()) }); await close
  if (requireGraceful) assert(logs().some(row => row.pid === pid && row.event === 'host.stopped' && row.result === 'graceful'))
  running = undefined
}
const install = installer => new Promise((resolve, reject) => {
    const child = spawn(installer, ['/S', '/currentuser', `/D=${appDirectory}`], {
      argv0: `"${installer}"`, windowsVerbatimArguments: true, windowsHide: true, env, stdio: 'inherit',
    })
    const timeout = setTimeout(() => reject(new Error('Initial installation timed out')), 240_000)
    child.once('error', reject); child.once('close', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Initial installer exited ${code}`)) })
})
const createRetainedData = page => page.evaluate(async () => {
  localStorage.setItem('easywork-update-acceptance', 'preserve across restart')
  const response = await fetch('/api/easywork-projects', { method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({endpoint:'create',payload:{name:'Automatic update acceptance'}}) })
  const result = await response.json(); if (!result.ok) throw new Error('Cannot create test project'); return result.value.project.id
})
try {
  let projectId
  const marker = join(home, 'update-acceptance.txt'), markerText = 'Preserve this local file through manual and automatic upgrades.\n'
  if (legacy) {
    checkpoint('Install previously published updater-disabled version')
    await install(join(legacyDirectory, `EasyWork-${legacy.version}-x64-Setup.exe`))
    const previous = await launch(legacy.version, false)
    projectId = await createRetainedData(previous.page); writeFileSync(marker, markerText)
    await quit(previous.pid, false) // The old release predates the graceful-worker fix.
    proof.legacyQuitResult = logs().find(row => row.pid === previous.pid && row.event === 'host.stopped')?.result
  }
  checkpoint('Install baseline over any existing legacy installation')
  await install(join(baselineDirectory, `EasyWork-${baseline.version}-x64-Setup.exe`))
  assert.equal(installedVersion(), baseline.version); assert(existsSync(join(appDirectory, 'Uninstall EasyWork.exe')))
  proof.checks.normalInstallation = true
  if (legacy) { assert.equal(readFileSync(marker, 'utf8'), markerText); proof.checks.legacyToBaseline = true }
  const cachedInstaller = join(process.env.LOCALAPPDATA, baseline.updaterCacheDirName, CURRENT_APP_INSTALLER_FILE_NAME)
  assert(existsSync(cachedInstaller), 'Normal installation must seed the differential installer cache')
  assert.equal(await hashFile(cachedInstaller), baseline.installerSha512)
  if (scenario === 'missing-cache') rmSync(cachedInstaller) // one verified runner-created file, never a directory
  server = await startUpdateAcceptanceServer({ candidate, candidateDirectory, baseline, baselineDirectory,
    scenario: scenario === 'missing-cache' ? 'delta' : scenario })
  let { page, pid } = await launch(baseline.version)
  if (!legacy) { projectId = await createRetainedData(page); writeFileSync(marker, markerText) }
  const markerHash = await hashFile(marker)
  if (scenario === 'offline') {
    await expect.poll(() => page.evaluate(() => window.easyworkUpdates.get()), { timeout: 60_000 }).toMatchObject({ state: 'error' })
    assert.equal(installedVersion(), baseline.version)
    server.online(); await page.evaluate(() => window.easyworkUpdates.check())
    proof.checks.offlineRetry = true
  }
  const notice = page.getByRole('status', { name: '应用更新' })
  await notice.getByText('新版本就绪', { exact: true }).waitFor({ timeout: 240_000 })
  await page.screenshot({ path: join(output, 'update-ready.png') })
  await running.evaluate(({ shell }) => { globalThis.openedReleaseNotes = []; shell.openExternal = async url => { globalThis.openedReleaseNotes.push(url) } })
  await notice.getByRole('button', { name: '更新日志', exact: true }).click()
  assert.deepEqual(await running.evaluate(() => globalThis.openedReleaseNotes), [`https://github.com/hicms/EasyWork/releases/tag/acceptance-v${candidate.version}`])
  await notice.getByRole('button', { name: '稍后更新' }).click()
  await expect(notice).toHaveCount(0)
  await quit(pid); assert.equal(installedVersion(), baseline.version)
  proof.checks.ordinaryQuitDoesNotInstall = true
  const payloads = server.requests.filter(row => row.complete && row.path.endsWith('.exe'))
  proof.installerBytesServed = payloads.reduce((sum, row) => sum + row.bytes, 0)
  proof.fullInstallerBytes = candidate.assets.find(row => row.name.endsWith('.exe')).size
  if (scenario === 'delta' || scenario === 'offline') {
    assert(payloads.some(row => row.range !== null), 'Expected actual differential Range downloads')
    assert(proof.installerBytesServed < proof.fullInstallerBytes, 'Differential transfer must be smaller than the full installer')
    proof.checks.differentialDownload = true
  } else {
    assert(payloads.some(row => row.range === null && row.bytes === proof.fullInstallerBytes), 'Expected an actual full-download fallback')
    proof.checks[scenario === 'missing-cache' ? 'missingCacheFullDownload' : 'corruptDeltaFullDownload'] = true
  }
  ;({ page, pid } = await launch(baseline.version))
  await page.getByText('新版本就绪', { exact: true }).waitFor({ timeout: 120_000 })
  const installingAt = Date.now()
  // Playwright launches a cmd.exe wrapper on Windows. Hold the actual main
  // process handle before clicking, so wrapper lifetime and PID reuse cannot pass.
  const observer = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
$ErrorActionPreference = 'Stop'
$application = Get-Process -Id ${pid}
try {
$handle = $application.Handle
if ($handle -eq 0) { throw 'Cannot hold the main process handle' }
if ($application.Path -ine $env:EASYWORK_ACCEPTANCE_EXECUTABLE) { throw 'Unexpected main process path' }
  $all = @(Get-CimInstance Win32_Process)
  $ids = [Collections.Generic.HashSet[uint32]]::new()
  foreach ($item in $all) { if ($item.ExecutablePath -and $item.ExecutablePath.StartsWith($env:EASYWORK_ACCEPTANCE_DIRECTORY, [StringComparison]::OrdinalIgnoreCase)) { [void]$ids.Add($item.ProcessId) } }
  do {
    $added = $false
    foreach ($item in $all) { if ($ids.Contains($item.ParentProcessId) -and $ids.Add($item.ProcessId)) { $added = $true } }
  } while ($added)
  $owned = @($all | Where-Object { $ids.Contains($_.ProcessId) } | Select-Object ProcessId, ParentProcessId, ExecutablePath, @{Name='Role'; Expression={ if ($_.CommandLine -match '--easywork-browser-worker-port=') { 'browser-worker' } elseif ($_.CommandLine -match '--type=([a-z-]+)') { $Matches[1] } else { 'main-or-tool' } }})
  @{ time = [DateTime]::UtcNow.ToString('o'); processes = $owned } | ConvertTo-Json -Depth 4 -Compress | Add-Content -LiteralPath $env:EASYWORK_ACCEPTANCE_PROCESS_LOG
if (-not $application.WaitForExit(40000)) { throw 'Main process did not exit for installation' }
@{ time = [DateTime]::UtcNow.ToString('o'); pid = $application.Id; exitCode = $application.ExitCode } | ConvertTo-Json -Compress | Set-Content -LiteralPath $env:EASYWORK_ACCEPTANCE_EXIT_LOG -Encoding UTF8
} finally { $application.Dispose() }
`], { windowsHide: true, env: { ...env, EASYWORK_ACCEPTANCE_DIRECTORY: appDirectory + '\\', EASYWORK_ACCEPTANCE_EXECUTABLE: appExecutable,
    EASYWORK_ACCEPTANCE_PROCESS_LOG: join(output, 'shutdown-processes.jsonl'), EASYWORK_ACCEPTANCE_EXIT_LOG: join(output, 'main-exit.json') }, stdio: 'inherit' })
  let observationFailure
  const observed = new Promise(resolve => {
    observer.once('error', error => { observationFailure = error; resolve() })
    observer.once('close', code => { if (code !== 0) observationFailure ??= new Error(`Process observer exited ${code}`); resolve() })
  })
  await waitFor(() => {
    if (observationFailure) throw observationFailure
    return existsSync(join(output, 'shutdown-processes.jsonl'))
  }, 'first owned-process snapshot', 45_000)
  checkpoint('Click restart and await natural process exit')
  await page.getByRole('button', { name: '重启升级', exact: true }).click({ noWaitAfter: true, timeout: 10_000 })
  await observed
  if (observationFailure) throw observationFailure
  const mainExit = JSON.parse(readFileSync(join(output, 'main-exit.json'), 'utf8').replace(/^\uFEFF/u, ''))
  assert.equal(mainExit.pid, pid); assert.equal(mainExit.exitCode, 0)
  running = undefined
  assert(logs().some(row => row.pid === pid && Date.parse(row.time) >= installingAt && row.event === 'host.stopped' && row.result === 'graceful'))
  await waitFor(() => installedVersion() === candidate.version, 'B installed')
  const restart = await waitFor(() => logs().find(row => row.pid !== pid && Date.parse(row.time) >= installingAt && row.event === 'startup.complete'), 'B automatically relaunched and rendered')
  proof.checks.aToB = true; proof.checks.automaticRelaunch = true
  proof.relaunchedPid = restart.pid
  // Exercise B's real Quit accelerator in this disposable desktop, then inspect B through Playwright.
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type 'using System; using System.Runtime.InteropServices; public class EasyWorkAcceptanceWindow { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); }'
$candidateProcess = Get-Process -Id ${restart.pid}
if ($candidateProcess.Path -ine $env:EASYWORK_ACCEPTANCE_EXECUTABLE -or $candidateProcess.MainWindowHandle -eq 0) { throw 'Unexpected relaunched application' }
if (-not [EasyWorkAcceptanceWindow]::SetForegroundWindow($candidateProcess.MainWindowHandle)) { throw 'Cannot focus relaunched application' }
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait('^q')
`], { windowsHide: true, env: { ...env, EASYWORK_ACCEPTANCE_EXECUTABLE: appExecutable }, stdio: 'inherit' })
  await waitFor(() => logs().some(row => row.pid === restart.pid && row.event === 'host.stopped' && row.result === 'graceful'), 'B graceful ordinary quit', 30_000)
  await waitFor(() => { try { process.kill(restart.pid, 0); return false } catch { return true } }, 'B process exit', 30_000)
  ;({ page, pid } = await launch(candidate.version))
  const data = await page.evaluate(async projectId => {
    const response = await fetch('/api/easywork-projects', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:'get',payload:{projectId}})})
    const result=await response.json(); if (!result.ok) throw new Error('Retained project not readable')
    return { id:result.value.project.id, name:result.value.project.name, preference:localStorage.getItem('easywork-update-acceptance') }
  }, projectId)
  assert.equal(data.id,projectId); assert.equal(data.name,'Automatic update acceptance'); assert.equal(data.preference,'preserve across restart')
  assert.equal(await hashFile(marker),markerHash)
  proof.checks.dataPreserved = true
  if (legacy) proof.checks.legacyDataPreserved = true
  for (const [label, content] of [['项目', '新建项目'], ['专家', '制作专家'], ['技能', '技能市场'],
    ['连接器', 'MCP 服务管理'], ['资料库', '新建或导入资料'], ['插件', '添加插件']]) {
    await page.getByRole('navigation', { name:'全局面板' }).getByRole('button',{name:label,exact:true}).click()
    await page.getByText(content, { exact: true }).first().waitFor()
  }
  await page.getByRole('button',{name:'登录 EasyWork',exact:true}).click()
  await page.getByRole('heading',{name:'EasyWork 账号与模型',exact:true}).waitFor()
  await page.getByRole('dialog',{name:'设置',exact:true}).getByRole('button',{name:'关闭',exact:true}).click()
  await page.screenshot({path:join(output,'installed-B.png')})
  proof.checks.installedRuntime = true; proof.checks.requiredPluginViews = true
  await quit(pid); proof.checks.gracefulQuit = true
  proof.ok = true
} catch (error) {
  proof.failure = error.stack ?? String(error)
  checkpoint('Failed')
  throw error
} finally {
  if (!proof.ok) try {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = [Drawing.Bitmap]::new($bounds.Width, $bounds.Height)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save($env:EASYWORK_ACCEPTANCE_SCREENSHOT, [Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
`], { windowsHide: true, timeout: 10_000, env: { ...env, EASYWORK_ACCEPTANCE_SCREENSHOT: join(output, 'failure-desktop.png') }, stdio: 'ignore' })
  } catch { /* Diagnostics must not replace the original acceptance failure. */ }
  // Preserve the original failure even if Electron's error window cannot quit.
  let cleanupTimer
  if (running) await Promise.race([running.close().catch(() => {}), new Promise(resolve => { cleanupTimer = setTimeout(resolve, 15_000) })])
  clearTimeout(cleanupTimer)
  proof.requests = server?.requests ?? []
  await server?.close()
  if (existsSync(join(home,'logs/startup.log'))) copyFileSync(join(home,'logs/startup.log'),join(output,'startup.log'))
  writeFileSync(join(output,'acceptance.json'),JSON.stringify(proof,null,2)+'\n')
  console.log(JSON.stringify(proof))
  if (!proof.ok) process.exit(1) // A failed detached installer must not keep the test harness alive.
}
