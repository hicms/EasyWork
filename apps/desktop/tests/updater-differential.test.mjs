import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { dump } from 'js-yaml'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'
import { CURRENT_APP_INSTALLER_FILE_NAME } from 'builder-util-runtime'
import { NsisUpdater } from 'electron-updater'
import { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor.js'
import { GenericProvider } from 'electron-updater/out/providers/GenericProvider.js'
import { startUpdateAcceptanceServer } from './acceptance/update-acceptance-server.mjs'

test('pinned NSIS engine reuses ranges and verifies reconstructed bytes, with real full-download fallbacks', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'easywork-delta-bytes-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  // Synthetic byte fixtures, never runnable applications or installed packages.
  const oldBytes = randomBytes(512 * 1024), newBytes = Buffer.from(oldBytes)
  randomBytes(8192).copy(newBytes, 240 * 1024)
  const baseline = { version: '2.1.0-alpha.1', channel: 'alpha', assets: [] }
  const candidate = { version: '2.1.0-alpha.2', channel: 'alpha', assets: [] }
  for (const [release, bytes] of [[baseline, oldBytes], [candidate, newBytes]]) {
    const name = `EasyWork-${release.version}-x64-Setup.exe`
    await writeFile(join(directory, name), bytes)
    await buildBlockMap(join(directory, name), 'gzip', join(directory, name + '.blockmap'))
    release.assets.push({ name }, { name: name + '.blockmap' })
  }
  const sha512 = createHash('sha512').update(newBytes).digest('base64')
  for (const scenario of ['delta', 'missing-cache', 'corrupt-blockmap', 'corrupt-cache']) {
    await t.test(scenario, async t => {
      const server = await startUpdateAcceptanceServer({ candidate, baseline, candidateDirectory: directory, baselineDirectory: directory,
        scenario: scenario === 'corrupt-blockmap' ? scenario : 'delta' })
      t.after(() => server.close())
      const baseCachePath = join(directory, scenario), cache = join(baseCachePath, 'updater')
      await mkdir(cache, { recursive: true })
      if (scenario !== 'missing-cache') await writeFile(join(cache, CURRENT_APP_INSTALLER_FILE_NAME), scenario === 'corrupt-cache' ? Buffer.alloc(oldBytes.length, 0) : oldBytes)
      const config = join(baseCachePath, 'app-update.yml')
      await writeFile(config, dump({ updaterCacheDirName: 'updater', publisherName: 'Fixture publisher' }))
      const updater = new NsisUpdater(null, { version: baseline.version, name: 'EasyWork', isPackaged: true, baseCachePath,
        userDataPath: baseCachePath, appUpdateConfigPath: config, whenReady: async () => {}, quit() { throw new Error('No installer may run in this test') } })
      updater.autoDownload = false; updater.autoInstallOnAppQuit = false; updater.disableWebInstaller = true
      updater.logger = { info() {}, warn() {}, error() {}, debug() {} }
      // Keep the real downloader, hash validation, filesystem and HTTP behavior.
      // Only Electron's network transport and synthetic-fixture signatures are substituted.
      const executor = new ElectronHttpExecutor()
      executor.createRequest = (options, callback) => request(options, callback)
      updater.httpExecutor = executor
      updater.verifyUpdateCodeSignature = async () => null
      const url = `${server.url}/hicms/EasyWork/releases/download/v${candidate.version}/`
      const provider = new GenericProvider({ provider: 'generic', url }, updater, { executor, platform: 'win32', isUseMultipleRangeRequest: false })
      updater.updateInfoAndProvider = { provider, info: { version: candidate.version, files: [{ url: candidate.assets[0].name, sha512, size: newBytes.length }] } }
      const files = await updater.downloadUpdate()
      assert.equal(files.length, 1)
      const rebuilt = await readFile(files[0])
      assert.deepEqual(rebuilt, newBytes)
      assert.equal(createHash('sha512').update(rebuilt).digest('base64'), sha512)
      const payloads = server.requests.filter(row => row.complete && row.path.endsWith('.exe'))
      if (scenario === 'delta') {
        assert(payloads.some(row => row.range !== null), 'Must exercise actual Range downloads')
        assert(payloads.every(row => row.status === 206))
        const transferred = payloads.reduce((sum, row) => sum + row.bytes, 0)
        assert(transferred > 0 && transferred < newBytes.length / 2, `Expected old-file reuse, received ${transferred} bytes`)
        t.diagnostic(`Installer payload: ${transferred}/${newBytes.length} bytes transferred; reconstructed SHA-512 matches`)
      } else {
        const full = payloads.filter(row => row.range === null)
        assert.equal(full.length, 1, 'Pinned NSIS engine must perform a full fallback')
        assert.equal(full[0].bytes, newBytes.length)
      }
    })
  }
})
