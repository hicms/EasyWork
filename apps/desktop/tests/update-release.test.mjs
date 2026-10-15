import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { createHash } from 'node:crypto'
import childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'
import { DesktopUpdateController } from '../src/desktop-update-controller.ts'
import { dump, load } from 'js-yaml'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'
import { signedWindowsConfig } from '../scripts/release-win.mjs'
import { unsignedWindowsConfig } from '../scripts/windows-installer.mjs'
import { hashFile, verifyUpdateArtifacts } from '../scripts/verify-update-artifacts.mjs'
import { ACCEPTANCE_CHECKS, BOOTSTRAP_CHECKS, findRelease, listReleases, verifyAcceptance, verifyBootstrapHistory, verifyReleaseSource } from '../../../scripts/desktop-release-policy.mjs'
import { startUpdateAcceptanceServer } from '../scripts/update-acceptance-server.mjs'
import { createUpdater } from '../src/updater-runtime.ts'
import { verifyWindowsUpdateSignature } from '../src/windows-update-signature.ts'
import { verifyLinkedBuilderPatch } from '../scripts/verify-builder-patch.mjs'

test('actual pinned updater checks cached identities before Host shutdown', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'easywork-updater-construction-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const config = join(directory, 'app-update.yml')
  await writeFile(config, dump({ provider: 'github', owner: 'hicms', repo: 'EasyWork', publisherName: 'Publisher', updaterCacheDirName: 'dsh-plugin-desktop-updater' }))
  globalThis.easyworkTestQuits = 0
  const hook = registerHooks({
    resolve(specifier, context, next) { return specifier === 'electron' ? { url: 'easywork-test:electron', shortCircuit: true } : next(specifier, context) },
    load(url, context, next) {
      if (url !== 'easywork-test:electron') return next(url, context)
      return { format: 'commonjs', shortCircuit: true, source: `module.exports = { app: {
        getVersion: () => '2.1.0-alpha.1', getName: () => 'EasyWork', isPackaged: true,
        getPath: () => ${JSON.stringify(directory)}, whenReady: () => Promise.resolve(), quit: () => { globalThis.easyworkTestQuits++ }
      } }` }
    },
  })
  t.after(() => { hook.deregister(); delete globalThis.easyworkTestQuits })
  let canQuit = true
  let authorized = 0
  const updater = createUpdater(config, () => canQuit, () => { authorized++ })
  assert(updater.httpExecutor, 'An explicit AppAdapter would accidentally disable the v26 executor')
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.disableDifferentialDownload, false)
  assert.equal(updater.disableWebInstaller, true)
  const queued = new Promise(resolve => setImmediate(() => { updater.app.quit(); resolve() }))
  canQuit = false
  await queued; assert.equal(globalThis.easyworkTestQuits, 0)
  canQuit = true; updater.app.quit(); assert.equal(globalThis.easyworkTestQuits, 1)
  // Model upstream's cached download path, which bypasses its signature hook.
  const parent = Object.getPrototypeOf(Object.getPrototypeOf(updater))
  const descriptor = Object.getOwnPropertyDescriptor(parent, 'downloadUpdate')
  const installer = join(directory, 'Setup.exe'), bytes = Buffer.alloc(256, 42)
  const info = { version: '2.1.0-alpha.2', files: [{ url: 'Setup.exe', sha512: createHash('sha512').update(bytes).digest('base64'), size: bytes.length }] }
  await writeFile(installer, bytes)
  updater.updateInfoAndProvider = { info }
  let cleared = 0
  parent.downloadUpdate = async () => {
    updater.downloadedUpdateHelper = { file: installer, clear: async () => { cleared++ } }
    return [installer]
  }
  try {
    updater.verifyUpdateCodeSignature = async () => 'Verifier unavailable'
    await assert.rejects(updater.downloadUpdate(), /Verifier unavailable/u)
    updater.verifyUpdateCodeSignature = async () => null
    assert.deepEqual(await updater.downloadUpdate(), [installer])
    for (const mutation of ['deleted', 'changed', 'wrong-version']) {
      await writeFile(installer, bytes); await updater.downloadUpdate()
      if (mutation === 'deleted') await rm(installer)
      if (mutation === 'changed') await writeFile(installer, Buffer.alloc(bytes.length, 41))
      let stopped = 0, recovered = 0
      const controller = new DesktopUpdateController(updater, {
        currentVersion: '2.1.0-alpha.1', discover: async () => info.version, changed: () => {}, error: () => {},
        prepareInstall: async () => { stopped++ }, installFailed: () => { recovered++ },
      })
      controller.state = 'downloaded'; controller.version = mutation === 'wrong-version' ? '2.1.0-alpha.3' : info.version
      await controller.install()
      assert.equal(controller.state, 'error'); assert.equal(stopped, 0); assert.equal(recovered, 0)
    }
    assert(cleared >= 4)
    await t.test('Windows waits for installer spawn before quitting', { skip: process.platform !== 'win32' }, async t => {
      await writeFile(installer, bytes); await updater.downloadUpdate()
      let spawned = Promise.withResolvers(), child, stopped = 0, recovered = 0
      const errors = []
      const spawn = t.mock.method(childProcess, 'spawn', () => {
        child = Object.assign(new EventEmitter(), { pid: 123, unref() {} })
        spawned.resolve()
        return child
      })
      const controller = new DesktopUpdateController(updater, {
        currentVersion: '2.1.0-alpha.1', discover: async () => info.version, changed: () => {}, error: error => errors.push(error),
        prepareInstall: async () => { stopped++ }, installFailed: () => { recovered++ },
      })
      controller.state = 'downloaded'; controller.version = info.version
      globalThis.easyworkTestQuits = 0
      const failure = controller.install()
      await spawned.promise
      assert.equal(stopped, 1); assert.equal(controller.state, 'installing')
      assert.equal(globalThis.easyworkTestQuits, 0, 'A PID must not authorize quit')
      assert.equal(authorized, 0, 'Main process must keep rejecting quit while spawn is pending')
      child.emit('error', Object.assign(new Error('missing executable'), { code: 'ENOENT' }))
      await failure
      assert.equal(controller.state, 'error'); assert.equal(recovered, 1)
      assert.match(errors[0].message, /missing executable/u)
      assert.equal(globalThis.easyworkTestQuits, 0)
      assert.equal(authorized, 0, 'A failed spawn must never authorize final quit')
      spawned = Promise.withResolvers(); controller.state = 'downloaded'
      const retry = controller.install()
      await spawned.promise
      child.emit('spawn'); await retry
      assert.equal(globalThis.easyworkTestQuits, 1)
      assert.equal(authorized, 1)
      assert.equal(spawn.mock.calls.at(-1).arguments[1].at(-1), `/D=${(await import('node:path')).dirname(process.execPath)}`)
      spawn.mock.restore()
    })
  } finally {
    if (descriptor) Object.defineProperty(parent, 'downloadUpdate', descriptor)
    else delete parent.downloadUpdate
  }
  await writeFile(config, dump({ provider: 'github', owner: 'hicms', repo: 'EasyWork', updaterCacheDirName: 'cache' }))
  assert.throws(() => createUpdater(config, () => true, () => {}), /签名发布者/u)
  const acceptance = createUpdater(config, () => true, () => {}, 'unsigned-acceptance')
  assert.equal(await acceptance.verifyUpdateCodeSignature([], installer), null)
  await writeFile(installer, bytes)
  acceptance.updateInfoAndProvider = { info }
  const originalDownload = parent.downloadUpdate
  parent.downloadUpdate = async function () { this.downloadedUpdateHelper = { file: installer, clear: async () => {} }; return [installer] }
  try {
    await acceptance.downloadUpdate()
    await writeFile(installer, Buffer.alloc(bytes.length, 1))
    await assert.rejects(acceptance.validateCandidate(info.version), /SHA-512/u)
  } finally { parent.downloadUpdate = originalDownload }
  await writeFile(config, dump({ provider: 'github', owner: 'other', repo: 'EasyWork', updaterCacheDirName: 'cache' }))
  assert.throws(() => createUpdater(config, () => true, () => {}, 'unsigned-acceptance'))
  const build = unsignedWindowsConfig('2.1.0-alpha.1', true)
  assert.equal(build.extraMetadata.easyworkUpdateTarget, 'nsis-acceptance')
  assert.equal(build.nsis.differentialPackage, true)
  assert.equal(unsignedWindowsConfig('2.1.0-alpha.1').publish, null)
  assert.throws(() => unsignedWindowsConfig('2.1.0', true))
})

test('signing rejects a stale linked builder before accessing templates or building', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'easywork-builder-lock-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'node_modules'))
  await writeFile(join(directory, 'yarn.lock'), dump({ 'app-builder-lib@patch:test': { resolution: 'app-builder-lib@patch:test::version=26.15.7&hash=123abc&locator=root' } }))
  await writeFile(join(directory, 'node_modules/.yarn-state.yml'), dump({ 'app-builder-lib@patch:test::version=26.15.7&hash=456def&locator=root': { locations: ['node_modules/app-builder-lib'] } }))
  assert.throws(() => verifyLinkedBuilderPatch(directory, join(directory, 'missing-templates')), /patch differs from yarn.lock/u)
})

test('runtime Authenticode verification fails closed on unavailable tooling and invalid signer results', async () => {
  const path = "C:\\cache\\it's` safe\\Setup.exe"
  const valid = { Status: 0, Path: path, Publisher: 'Publisher', Timestamped: true }
  let command
  assert.equal(await verifyWindowsUpdateSignature(['Publisher'], path, async text => { command = text; return JSON.stringify(valid) }), null)
  assert(command.includes("-LiteralPath 'C:\\cache\\it''s` safe\\Setup.exe'"))
  assert.match(await verifyWindowsUpdateSignature(['Publisher'], path, async () => { throw new Error('PowerShell unavailable') }), /could not be completed/u)
  for (const result of ['invalid JSON', '{}', ...[
    { Status: 1 }, { Path: 'C:\\other.exe' }, { Path: undefined }, { Publisher: 'Wrong' }, { Publisher: 'publisher' }, { Timestamped: false },
  ].map(change => JSON.stringify({ ...valid, ...change }))]) {
    assert.notEqual(await verifyWindowsUpdateSignature(['Publisher'], path, async () => result), null)
  }
  assert.notEqual(await verifyWindowsUpdateSignature([], path, async () => JSON.stringify(valid)), null)
})

test('formal signing is explicit and refuses secret gaps, wrong channels and tool overrides', () => {
  const options = { env: { WIN_CSC_LINK: 'certificate', WIN_CSC_KEY_PASSWORD: 'password', EASYWORK_WIN_PUBLISHER: 'Publisher' }, platform: 'win32', arch: 'x64', version: '2.1.0-alpha.1', channel: 'alpha' }
  const config = signedWindowsConfig(options)
  assert.equal(config.forceCodeSigning, true)
  assert.equal(config.win.verifyUpdateCodeSignature, true)
  assert.equal(config.extraMetadata.easyworkUpdateTarget, 'nsis')
  for (const key of Object.keys(options.env)) {
    const env = { ...options.env }; delete env[key]
    assert.throws(() => signedWindowsConfig({ ...options, env }), /requires/u)
  }
  for (const key of ['ELECTRON_BUILDER_7ZIP_PATH', 'ELECTRON_BUILDER_NSIS_DIR', 'CSC_LINK']) assert.throws(() => signedWindowsConfig({ ...options, env: { ...options.env, [key]: 'override' } }), /refuses/u)
  assert.throws(() => signedWindowsConfig({ ...options, channel: 'latest' }), /channel/u)
  assert.throws(() => signedWindowsConfig({ ...options, platform: 'linux' }), /Windows/u)
})

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'easywork-update-metadata-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const version = '2.1.0-alpha.2', installer = `EasyWork-${version}-x64-Setup.exe`, bytes = Buffer.alloc(96_000, 31)
  await writeFile(join(directory, installer), bytes)
  await buildBlockMap(join(directory, installer), 'gzip', join(directory, `${installer}.blockmap`))
  const sha512 = await hashFile(join(directory, installer))
  const metadata = { version, path: installer, sha512, files: [{ url: installer, sha512, size: bytes.length }] }
  await writeFile(join(directory, 'alpha.yml'), dump(metadata))
  return { directory, version, installer, metadata }
}
test('final byte verifier catches post-sign changes and incorrect hashes', async t => {
  const f = await fixture(t)
  assert.equal((await verifyUpdateArtifacts(f.directory, f.version)).assets.length, 3)
  await writeFile(join(f.directory, f.installer), Buffer.alloc(96_000, 32))
  await assert.rejects(verifyUpdateArtifacts(f.directory, f.version), /final installer bytes/u)
})
test('blockmap and channel mismatches fail even when installer hash is correct', async t => {
  const f = await fixture(t), map = join(f.directory, `${f.installer}.blockmap`)
  const original = await readFile(map)
  await writeFile(map, 'corrupt map')
  await assert.rejects(verifyUpdateArtifacts(f.directory, f.version), /Blockmap/u)
  await writeFile(map, original)
  await writeFile(join(f.directory, 'latest.yml'), dump(f.metadata))
  await assert.rejects(verifyUpdateArtifacts(f.directory, f.version), /Mixed channel/u)
})

test('isolated acceptance fixture restores discovery after an offline simulation', async t => {
  const f = await fixture(t), candidate = { version: f.version, channel: 'alpha', assets: [{ name: f.installer }, { name: `${f.installer}.blockmap` }, { name: 'alpha.yml' }] }
  const options = { candidate, baseline: { ...candidate, version: '2.1.0-alpha.1' }, candidateDirectory: f.directory, baselineDirectory: f.directory }
  const offline = await startUpdateAcceptanceServer({ ...options, scenario: 'offline' })
  t.after(() => offline.close())
  await assert.rejects(fetch(offline.url + '/repos/hicms/EasyWork/releases'))
  offline.online()
  assert.equal((await (await fetch(offline.url + '/repos/hicms/EasyWork/releases')).json())[0].tag_name, `v${f.version}`)
})

test('source gate requires reachability and version already present in the selected commit', () => {
  const calls = [], options = { commit: 'a'.repeat(40), version: '2.1.0', channel: 'latest', defaultBranch: 'main', root: '.',
    git(args) { calls.push(args); return args[0] === 'show' ? '{"version":"2.1.0"}' : '' } }
  assert.equal(verifyReleaseSource(options).tag, 'v2.1.0')
  assert.deepEqual(calls[0], ['merge-base', '--is-ancestor', options.commit, 'refs/remotes/origin/main'])
  assert.throws(() => verifyReleaseSource({ ...options, commit: 'main' }), /full commit/u)
  assert.throws(() => verifyReleaseSource({ ...options, git() { throw new Error('not an ancestor') } }), /ancestor/u)
  assert.throws(() => verifyReleaseSource({ ...options, version: '2.1.1' }), /already be committed/u)
})

test('publish acceptance binds every real check to exact source and installer', () => {
  const release = { sourceCommit: 'a'.repeat(40), version: '2.1.0', channel: 'latest', installerSha512: 'hash' }
  const evidence = { ...release, mode: 'upgrade', evidenceUrl: 'https://github.com/hicms/EasyWork/issues/1#issuecomment-2', checks: Object.fromEntries(ACCEPTANCE_CHECKS.map(name => [name, true])) }
  assert.equal(verifyAcceptance(evidence, release), evidence.evidenceUrl)
  for (const check of ACCEPTANCE_CHECKS) assert.throws(() => verifyAcceptance({ ...evidence, checks: { ...evidence.checks, [check]: false } }, release), new RegExp(check))
  assert.throws(() => verifyAcceptance({ ...evidence, installerSha512: 'other' }, release), /exact signed/u)
  assert.throws(() => verifyAcceptance({ ...evidence, sourceCommit: 'b'.repeat(40) }, release), /exact signed/u)
})

test('pending-tag draft lookup uses full authenticated history and rejects duplicate tags', async () => {
  const draft = { tag_name: 'v2.1.0', draft: true, assets: [] }, paths = []
  const releases = await listReleases(async path => {
    paths.push(path)
    return paths.length === 1 ? Array.from({ length: 100 }, (_, i) => ({ tag_name: `unrelated-${i}` })) : [draft]
  })
  assert.equal(findRelease(releases, 'v2.1.0'), draft)
  assert.deepEqual(paths, ['/releases?per_page=100&page=1', '/releases?per_page=100&page=2'])
  assert.throws(() => findRelease([draft, draft], 'v2.1.0'), /Multiple releases/u)
  await assert.rejects(listReleases(async () => { throw new Error('API unavailable') }), /unavailable/u)
})

test('bootstrap cannot assert unperformed differential checks or bypass an earlier same-channel release', () => {
  const release = { sourceCommit: 'a'.repeat(40), version: '2.1.0', channel: 'latest', installerSha512: 'hash' }
  const evidence = { ...release, mode: 'bootstrap', evidenceUrl: 'https://github.com/hicms/EasyWork/issues/1',
    checks: Object.fromEntries(BOOTSTRAP_CHECKS.map(name => [name, true])), unperformed: ACCEPTANCE_CHECKS.filter(name => !BOOTSTRAP_CHECKS.includes(name)) }
  verifyAcceptance(evidence, release)
  assert.throws(() => verifyAcceptance({ ...evidence, checks: { ...evidence.checks, aToB: true } }, release), /unperformed/u)
  verifyBootstrapHistory([{ tag_name: 'v2.0.0-alpha.1', draft: false, assets: [{ name: 'release.json' }] }], 'latest')
  assert.throws(() => verifyBootstrapHistory([{ tag_name: 'v2.0.0', draft: false, assets: [{ name: 'release.json' }] }], 'latest'), /first updater/u)
})

test('manual release preserves source, acceptance and signing gates', async () => {
  const workflow = load(await readFile(new URL('../../../.github/workflows/release-windows.yml', import.meta.url), 'utf8'))
  const ci = load(await readFile(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'])
  assert.deepEqual(Object.keys(ci.on).sort(), ['workflow_call', 'workflow_dispatch'])
  assert.equal(workflow.permissions.contents, 'read')
  assert.equal(workflow.jobs.checks.with.revision, '${{ needs.source.outputs.commit }}')
  assert.deepEqual(workflow.jobs.windows.needs, ['source', 'checks'])
  assert.equal(workflow.jobs.windows.environment, 'desktop-release-signing')
  const windowsSteps = workflow.jobs.windows.steps
  const updateChecks = windowsSteps.findIndex(step => step.run === 'corepack yarn check:updates')
  assert(updateChecks >= 0, 'Windows release must run the Windows-specific updater regressions')
  const checkStep = windowsSteps[updateChecks]
  assert.equal(checkStep.if, undefined, 'Updater regressions must not be conditional')
  assert.equal(checkStep['continue-on-error'], undefined, 'Updater failures must stop the release')
  assert(workflow.jobs.windows.steps.some(step => step.run === 'node apps/desktop/scripts/accept-windows-package.mjs'))
  assert.equal(workflow.jobs.publish.environment, 'desktop-release-publish')
  assert(workflow.jobs.publish.steps.some(step => step.with?.['run-id'] === '${{ inputs.candidate_run }}'))
  assert(ci.jobs['desktop-check']); assert(ci.jobs['web-check'])
  assert.deepEqual(Object.entries(workflow.jobs).filter(([, job]) => job.permissions?.contents === 'write').map(([name]) => name), ['draft', 'publish'])
})
