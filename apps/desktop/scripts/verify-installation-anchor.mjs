#!/usr/bin/env node
/** Boot the public official Profile API with release resources and no local node_modules. */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { materializeRuntimeProfile, officialHostLauncher } from '../src/local-runtime.ts'
import { DSH_VERSION } from './runtime-version.mjs'
import { PRODUCT_PACKAGES } from './workdsh-package-boundary.mjs'
import { verifyOfficialWebPackages } from './verify-profile-release.mjs'

const runtime = resolve(process.argv[2] ?? fileURLToPath(new URL('../build/workdsh-runtime', import.meta.url)))
const source = join(runtime, 'profiles/workdsh')
const primary = join(runtime, 'primary-runtime')
const executable = join(primary, 'dependencies/node/bin', process.platform === 'win32' ? 'node.exe' : 'node')
const pnpm = join(primary, 'dependencies/pnpm/bin/pnpm.cjs')
const release = JSON.parse(readFileSync(join(runtime, 'package-cache/release-manifest.json'), 'utf8'))
const actual = JSON.parse(readFileSync(join(source, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version
if (actual !== DSH_VERSION) throw new Error('Installation anchor uses another official DSH version')
verifyOfficialWebPackages(release, source)
const home = mkdtempSync(join(tmpdir(), 'workdsh-anchor-check-'))
let child
let finished
let output = ''
const scrub = value => value.replace(/\?token=[^\s]+/gu, '?token=[redacted]')
try {
  const { profile } = materializeRuntimeProfile(source, home)
  if (existsSync(join(profile, 'node_modules'))) throw new Error('Fresh Profile unexpectedly has its own dependency tree')
  const inventory = spawnSync(executable, [fileURLToPath(new URL('./verify-product-plugin-inventory.mjs', import.meta.url)), runtime, profile], { encoding: 'utf8', timeout: 30_000 })
  if (inventory.error || inventory.status !== 0) throw new Error('Writable Profile product inventory failed: ' + (inventory.error?.message ?? scrub(inventory.stdout + inventory.stderr)))
  const patch = join(home, '.headless-port.patch.yml')
  writeFileSync(patch, '- id: webserver\n  config:\n    host: 127.0.0.1\n    port: 0\n', { mode: 0o600 })
  const launcher = officialHostLauncher(source, home, executable, pnpm, [join(source, 'cordis.patch.yml'), patch])
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(?:KEY|SECRET|TOKEN|PASSWORD|DSH_|WORKDSH_)/iu.test(key)))
  Object.assign(env, { HOME: home, USERPROFILE: home, DSH_HOME: home, DSH_AGENTS_HOME: join(home, 'agents'), DSH_BUNDLED_PRIMARY_RUNTIME: primary, DSH_TELEMETRY_DISABLED: '1' })
  const ready = new Promise((resolveReady, reject) => {
    child = spawn(executable, [launcher, '--no-open'], { env, cwd: home, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => reject(new Error('Official anchored runtime did not become ready: ' + scrub(output).slice(-5000))), 90_000)
    finished = new Promise(resolveExit => child.once('close', resolveExit))
    const read = chunk => {
      output = (output + chunk.toString()).slice(-64_000)
      const match = output.match(/http:\/\/(?:127\.0\.0\.1|localhost):\d+\/[^\s\u001b]*\?token=[^\s\u001b]+/u)
      if (match) { clearTimeout(timer); resolveReady(match[0]) }
    }
    child.stdout.on('data', read); child.stderr.on('data', read)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Official runtime exited before readiness (' + code + '): ' + scrub(output).slice(-5000))) })
  })
  const url = await ready
  const authorize = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000) })
  if (authorize.status !== 303) throw new Error('Official process-token login did not exchange for a browser cookie')
  const target = new URL(authorize.headers.get('location'), url)
  if (target.origin !== new URL(url).origin) throw new Error('Official process-token login changed origin')
  const cookie = authorize.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  if (!cookie) throw new Error('Official process-token login did not issue a cookie')
  const response = await fetch(target, { headers: { cookie }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error('Official Web page failed: ' + response.status)
  const html = await response.text()
  const match = html.match(/globalThis\["__DSH_BOOT__"\] = (.*?)<\/script>/su)
  if (!match) throw new Error('Official Web did not advertise its Client boot graph')
  const graph = JSON.parse(match[1])
  const ids = new Set(graph.entries.map(entry => entry.id))
  for (const client of release.officialWeb.clients.filter(row => !row.conditional)) {
    if (!ids.has(client.package)) throw new Error('Unconditional official Web client missing at runtime: ' + client.package)
  }
  for (const name of [...PRODUCT_PACKAGES, 'workdsh-bundle']) if (!ids.has(name)) throw new Error('Owned client missing at runtime: ' + name + '; owned graph=' + [...ids].filter(row => row.startsWith('workdsh-')).join(',') + '; ' + scrub(output).slice(-6000))
  const owned = [...ids].filter(name => name.startsWith('workdsh-')).sort()
  if (JSON.stringify(owned) !== JSON.stringify([...PRODUCT_PACKAGES, 'workdsh-bundle'].sort())) throw new Error('Unexpected default owned client inventory')
  for (const batch of graph.batches) {
    const artifact = await fetch(new URL(batch.url, url), { signal: AbortSignal.timeout(20_000) })
    if (!artifact.ok || !(await artifact.text()).includes('__ModuleLoader__')) throw new Error('Advertised client batch is unavailable')
  }
  if (existsSync(join(profile, 'node_modules'))) throw new Error('Runtime wrote a shared or copied dependency tree into the writable Profile')
  if (/failed to import/iu.test(output)) throw new Error('Official Host reported an unresolved plugin import: ' + scrub(output).slice(-5000))
  console.log(JSON.stringify({ dsh: actual, independentWritableProfile: true, noProfileNodeModules: true, installationProvidedProductBundles: PRODUCT_PACKAGES, officialRoster: release.officialWeb.clients.length, loadedOfficialClients: [...ids].filter(name => name.startsWith('@deepseek-ai/dsh')).length, ownedClients: owned, clientBatches: graph.batches.length, modelCallsRequested: 0, guiLaunchRequested: false }))
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    let timeout
    await Promise.race([finished, new Promise(resolveWait => { timeout = setTimeout(() => { child.kill('SIGKILL'); resolveWait() }, 10_000) })])
    clearTimeout(timeout)
    await finished
  }
  rmSync(home, { recursive: true, force: true })
}
