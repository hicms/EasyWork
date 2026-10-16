/** Stage only the verified unsigned acceptance channel; signed release gates stay separate. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { extractFile } from '@electron/asar'
import { load } from 'js-yaml'
import { verifyReleaseSource, readReleaseManifest } from '../../../scripts/desktop-release-policy.mjs'
import { releaseTag, UPDATE_REPOSITORY } from '../src/update-policy.ts'
import { verifyWindowsInstaller } from './verify-win-installer.ts'
import { hashFile, verifyUpdateArtifacts, verifyUiAcceptance } from './verify-update-artifacts.mjs'

const root = resolve(import.meta.dirname, '..'), dist = join(root, 'dist')
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const sourceCommit = git(['rev-parse', 'HEAD'])
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const defaultBranch = git(['symbolic-ref', 'refs/remotes/origin/HEAD']).replace('refs/remotes/origin/', '')
verifyReleaseSource({ commit: sourceCommit, version, channel: 'alpha', defaultBranch, root })
assert.equal(git(['status', '--porcelain', '--untracked-files=normal']), '', 'Release requires clean committed source')
const tag = releaseTag(version, 'unsigned-acceptance')
verifyWindowsInstaller({ desktopRoot: root, version })
const packed = JSON.parse(extractFile(join(dist, 'win-unpacked/resources/app.asar'), 'package.json'))
assert.equal(packed.version, version); assert.equal(packed.easyworkUpdateTarget, 'nsis-acceptance')
assert.equal(packed.easyworkSourceCommit, sourceCommit)
const receipt = JSON.parse(readFileSync(join(dist, 'unsigned-update-build.json'), 'utf8'))
assert.equal(receipt.sourceCommit, sourceCommit); assert.equal(receipt.version, version)
assert.equal(receipt.asarSha512, await hashFile(join(dist, 'win-unpacked/resources/app.asar')))
assert.equal(receipt.installerSha512, await hashFile(join(dist, `EasyWork-${version}-x64-Setup.exe`)))
const profile = JSON.parse(readFileSync(join(dist, 'win-unpacked/resources/easywork-runtime/package-cache/release-manifest.json'), 'utf8'))
assert.equal(profile.sourceCommit, sourceCommit); assert.equal(profile.sourceDirty, false)
const config = load(readFileSync(join(dist, 'win-unpacked/resources/app-update.yml'), 'utf8'))
assert.equal(config.provider, 'github'); assert.equal(`${config.owner}/${config.repo}`, UPDATE_REPOSITORY)
assert.equal(config.publisherName, undefined)
assert.match(config.updaterCacheDirName, /^[a-zA-Z\d._-]+$/u)
const uiDirectory = join(dist, 'acceptance-ui')
const ui = await verifyUiAcceptance(uiDirectory, version, join(dist, 'win-unpacked/resources/app.asar'))
assert(Date.parse(ui.testedAt) >= Date.parse(receipt.builtAt))
const output = join(dist, 'acceptance', version)
if (existsSync(output)) throw new Error('Refusing to replace an existing staged acceptance version')
mkdirSync(output, { recursive: true })
const installer = `EasyWork-${version}-x64-Setup.exe`
for (const name of [installer, installer + '.blockmap', 'alpha.yml']) copyFileSync(join(dist, name), join(output, name))
const result = await verifyUpdateArtifacts(output, version)
for (const name of ['ui-acceptance.json', 'personal.png']) {
  copyFileSync(join(uiDirectory, name), join(output, name))
  result.assets.push({ name, size: statSync(join(output, name)).size, sha256: await hashFile(join(output, name), 'sha256', 'hex') })
}
writeFileSync(join(output, 'release.json'), JSON.stringify({ sourceCommit, version, channel: 'alpha', updateMode: 'unsigned-acceptance',
  updaterCacheDirName: config.updaterCacheDirName, ...result }, null, 2) + '\n')
readReleaseManifest(join(output, 'release.json'), 'unsigned-acceptance')
console.log(JSON.stringify({ tag, sourceCommit, version, output, installerSha512: result.installerSha512 }))
