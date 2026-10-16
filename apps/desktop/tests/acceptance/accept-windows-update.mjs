/** Operator-driven A→B acceptance against exact signed draft bytes. Never used by product startup. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { readReleaseManifest } from '../../../../scripts/desktop-release-policy.mjs'
import { hashFile } from '../../scripts/verify-update-artifacts.mjs'
import { newerVersion } from '../../src/update-policy.ts'
import { startUpdateAcceptanceServer } from './update-acceptance-server.mjs'

if (process.platform !== 'win32' || !process.argv.includes('--confirm-isolated-vm')) {
  throw new Error('Run only in an isolated Windows VM with --confirm-isolated-vm; this tool can install a real update when you choose Restart and update')
}
const argument = name => {
  const value = process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)
  if (!value) throw new Error(`Missing --${name}=`)
  return value
}
const app = resolve(argument('app')), home = resolve(argument('home')), output = resolve(argument('output'))
const candidateDirectory = resolve(argument('candidate')), baselineDirectory = resolve(argument('baseline'))
const scenario = argument('scenario')
const verificationOnly = process.argv.includes('--verify-installed')
if (verificationOnly ? !existsSync(home) : existsSync(home)) throw new Error(verificationOnly
  ? 'Post-install verification requires the same existing isolated test Home'
  : 'Acceptance requires a new isolated Home; use --verify-installed only to inspect B in that same test Home')
if (!existsSync(join(dirname(app), 'Uninstall EasyWork.exe'))) throw new Error('Use the installed baseline A, not win-unpacked')
const candidate = readReleaseManifest(join(candidateDirectory, 'release.json')), baseline = readReleaseManifest(join(baselineDirectory, 'release.json'))
if (candidate.channel !== baseline.channel || !newerVersion(candidate.version, baseline.version)) throw new Error('Candidate must be newer in the same channel')
if (!candidate.updaterCacheDirName || candidate.updaterCacheDirName !== baseline.updaterCacheDirName) throw new Error('Baseline and candidate must keep the same updater cache identity')
for (const [release, directory] of [[candidate, candidateDirectory], [baseline, baselineDirectory]]) {
  for (const asset of release.assets) {
    if (statSync(join(directory, asset.name)).size !== asset.size || await hashFile(join(directory, asset.name), 'sha256', 'hex') !== asset.sha256) throw new Error('Acceptance asset differs from the signed candidate: ' + asset.name)
  }
}
const require = createRequire(new URL('../../../web/package.json', import.meta.url))
const { _electron } = require('@playwright/test')
const server = verificationOnly ? undefined : await startUpdateAcceptanceServer({ candidate, candidateDirectory, baseline, baselineDirectory, scenario })
const env = { ...process.env }
for (const name of Object.keys(env)) if (/TOKEN|PASSWORD|SECRET|KEY|^CSC_|^WIN_CSC_|^NODE_OPTIONS$|^NODE_PATH$|^EASYWORK_|^DSH_/u.test(name)) delete env[name]
env.EASYWORK_DESKTOP_USER_DATA = home
env.DSH_TELEMETRY_DISABLED = '1'
let running
let actualVersion, actualHome
const input = bytes => { if (bytes.toString().trim() === 'online' && server) { server.online(); console.log('Fixture is online; retry Check for updates.') } }
try {
  running = await _electron.launch({ executablePath: app, env, timeout: 120_000 })
  actualVersion = await running.evaluate(({ app }) => app.getVersion())
  actualHome = await running.evaluate(({ app }) => app.getPath('userData'))
  assert.equal(actualVersion, verificationOnly ? candidate.version : baseline.version)
  assert.equal(actualHome, home)
  if (server) await running.evaluate(({ session }, url) => {
    // Redirect discovery and updater requests only in this inspected test process.
    // The installed binary, version, signature checks and production feed remain unchanged.
    for (const partition of [session.defaultSession, session.fromPartition('electron-updater')]) {
      partition.webRequest.onBeforeRequest({ urls: [
        'https://api.github.com/repos/hicms/EasyWork/releases*',
        'https://github.com/hicms/EasyWork/releases/download/*',
      ] }, (details, callback) => {
        const requested = new URL(details.url)
        callback({ redirectURL: url + requested.pathname + requested.search })
      })
    }
  }, server.url)
  const page = await running.firstWindow({ timeout: 120_000 })
  mkdirSync(output, { recursive: true })
  await page.screenshot({ path: join(output, verificationOnly ? 'installed-B.png' : 'before-update.png') })
  process.stdin.on('data', input)
  console.log(verificationOnly
    ? 'Verified installed B version and the original test Home. Inspect retained conversations, credentials, files, settings, plugins and UI; capture evidence before closing. Ctrl+C ends observation. This tool does not assert data preservation.'
    : 'In the isolated VM, updates download automatically. Exercise the requested scenario; choose Restart and update only when ready. Type online then Enter to restore an offline fixture and choose Check for updates. Ctrl+C ends observation. Close any automatically relaunched B, then rerun this command with --verify-installed to inspect B in this same Home.')
  await Promise.race([running.waitForEvent('close', { timeout: 0 }), new Promise(resolve => process.once('SIGINT', resolve))])
} finally {
  process.stdin.off('data', input); process.stdin.pause()
  await running?.close().catch(() => {})
  await server?.close()
  mkdirSync(output, { recursive: true })
  const requests = server?.requests ?? []
  writeFileSync(join(output, verificationOnly ? 'installed-observation.json' : 'download-observation.json'), JSON.stringify({
    sourceCommit: candidate.sourceCommit, version: candidate.version, baseline: baseline.version, scenario,
    installerSha512: candidate.installerSha512, actualVersion, actualHome, requests,
    installerBytesServed: requests.filter(request => request.complete && request.path.endsWith('.exe')).reduce((sum, request) => sum + request.bytes, 0),
    acceptance: 'Observation only. Confirm installed B, UI, data retention and every required check separately.',
  }, null, 2) + '\n')
}
