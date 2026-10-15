/** Destructive installation acceptance only on fresh, disposable GitHub-hosted Windows runners. */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { extractFile } from '@electron/asar'
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
const waitFor = async (read, description, milliseconds = 180_000) => {
  const until = Date.now() + milliseconds
  while (Date.now() < until) { const value = await read(); if (value) return value; await delay(1000) }
  throw new Error('Timed out: ' + description)
}
const installedVersion = () => {
  try { return JSON.parse(extractFile(join(appDirectory, 'resources/app.asar'), 'package.json')).version } catch { return undefined }
}
const logs = () => {
  try { return readFileSync(join(home, 'logs/startup.log'), 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } }) }
  catch { return [] }
}
const launch = async (expected, intercept = true) => {
  running = await _electron.launch({ executablePath: appExecutable, env, args: ['--lang=zh-CN'], timeout: 180_000 })
  assert.equal(await running.evaluate(({ app }) => app.getVersion()), expected)
  const identity = JSON.parse(extractFile(join(appDirectory, 'resources/app.asar'), 'package.json'))
  const release = expected === baseline.version ? baseline : candidate
  assert.equal(identity.easyworkSourceCommit, release.sourceCommit); assert.equal(identity.easyworkUpdateTarget, 'nsis-acceptance')
  const profile = JSON.parse(readFileSync(join(appDirectory, 'resources/easywork-runtime/package-cache/release-manifest.json'), 'utf8'))
  assert.equal(profile.sourceCommit, release.sourceCommit); assert.equal(profile.sourceDirty, false)
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
  return { page, pid }
}
const quit = async pid => {
  const close = running.waitForEvent('close', { timeout: 30_000 })
  await running.evaluate(({ app }) => { setImmediate(() => app.quit()) }); await close
  assert(logs().some(row => row.pid === pid && row.event === 'host.stopped' && row.result === 'graceful'))
  running = undefined
}
try {
  const installer = join(baselineDirectory, `EasyWork-${baseline.version}-x64-Setup.exe`)
  await new Promise((resolve, reject) => {
    const child = spawn(installer, ['/S', '/currentuser', `/D=${appDirectory}`], {
      argv0: `"${installer}"`, windowsVerbatimArguments: true, windowsHide: true, env, stdio: 'inherit',
    })
    const timeout = setTimeout(() => reject(new Error('Initial installation timed out')), 240_000)
    child.once('error', reject); child.once('close', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Initial installer exited ${code}`)) })
  })
  assert.equal(installedVersion(), baseline.version); assert(existsSync(join(appDirectory, 'Uninstall EasyWork.exe')))
  proof.checks.normalInstallation = true
  const cachedInstaller = join(process.env.LOCALAPPDATA, baseline.updaterCacheDirName, CURRENT_APP_INSTALLER_FILE_NAME)
  assert(existsSync(cachedInstaller), 'Normal installation must seed the differential installer cache')
  assert.equal(await hashFile(cachedInstaller), baseline.installerSha512)
  if (scenario === 'missing-cache') rmSync(cachedInstaller) // one verified runner-created file, never a directory
  server = await startUpdateAcceptanceServer({ candidate, candidateDirectory, baseline, baselineDirectory,
    scenario: scenario === 'missing-cache' ? 'delta' : scenario })
  let { page, pid } = await launch(baseline.version)
  const projectId = await page.evaluate(async () => {
    localStorage.setItem('easywork-update-acceptance', 'preserve across restart')
    const response = await fetch('/api/easywork-projects', { method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({endpoint:'create',payload:{name:'Automatic update acceptance'}}) })
    const result = await response.json(); if (!result.ok) throw new Error('Cannot create test project'); return result.value.project.id
  })
  const marker = join(home, 'update-acceptance.txt'); writeFileSync(marker, 'Preserve this local file through A -> B.\n')
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
  const installingAt = Date.now(), closed = running.waitForEvent('close', { timeout: 40_000 })
  await page.getByRole('button', { name: '重启升级', exact: true }).click()
  await closed; running = undefined
  assert(logs().some(row => row.pid === pid && row.event === 'host.stopped' && row.result === 'graceful'))
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
  for (const [label, content] of [['项目', '新建项目'], ['专家', '制作专家'], ['技能', 'Excel 表格设计'],
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
  throw error
} finally {
  if (running) await running.close().catch(() => {})
  proof.requests = server?.requests ?? []
  await server?.close()
  if (existsSync(join(home,'logs/startup.log'))) copyFileSync(join(home,'logs/startup.log'),join(output,'startup.log'))
  writeFileSync(join(output,'acceptance.json'),JSON.stringify(proof,null,2)+'\n')
  console.log(JSON.stringify(proof))
}
