#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_VERSION } from '../apps/desktop/scripts/runtime-version.mjs'
import { RELEASE_PACKAGES } from '../apps/desktop/scripts/workdsh-package-boundary.mjs'
import { verifyProfileRelease, verifyReleaseArchives } from '../apps/desktop/scripts/verify-profile-release.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = join(root, 'apps/web')
const args = process.argv.slice(2)
const sourceArg = args.find(arg => arg.startsWith('--source='))
if (args.length !== 1 || !sourceArg || !['local', 'published'].includes(sourceArg.slice('--source='.length))) {
  throw new Error('Usage: node scripts/package-desktop-release.mjs --source=local|published')
}
const source = sourceArg.slice('--source='.length)
const platform = process.platform
if (platform !== 'darwin' && platform !== 'win32') {
  throw new Error(`Desktop installer packaging requires macOS or Windows; found ${platform}`)
}
const corepack = platform === 'win32' ? 'corepack.cmd' : 'corepack'

function run(label, command, commandArgs, { cwd = root, env = process.env } = {}) {
  console.log(`\n==> ${label}`)
  const result = spawnSync(command, commandArgs, {
    cwd,
    env,
    stdio: 'inherit',
    shell: platform === 'win32' && command === corepack,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
}

run('Install Desktop dependencies', corepack, ['yarn', 'install', '--immutable'])
run('Check Desktop packaging', corepack, ['yarn', 'workspace', 'dsh-plugin-desktop', platform === 'win32' ? 'check:win-package' : 'check:mac-package'])

const version = JSON.parse(readFileSync(join(webRoot, 'package.json'), 'utf8')).version
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const releaseDirectory = join(root, 'apps/desktop', 'build', `workdsh-profile-release-${source}-${commit.slice(0, 12)}-${Date.now()}`)
if (source === 'local') {
  run('Install Web dependencies', corepack, ['pnpm', 'install', '--frozen-lockfile'], { cwd: webRoot })
  run('Check Web and Desktop DSH alignment', process.execPath, [join(root, 'scripts/verify-web-desktop-dsh-alignment.mjs')])
  run('Build EasyWork Web and plugins', corepack, ['pnpm', 'build'], { cwd: webRoot })
  run('Pack this commit\'s EasyWork Profile', corepack, ['pnpm', 'release:project:pack'], { cwd: webRoot })
  const webReleaseDirectory = join(webRoot, '.artifacts', `project-v${version}`)
  const manifest = JSON.parse(readFileSync(join(webReleaseDirectory, 'release-manifest.json'), 'utf8'))
  if (manifest.version !== version || manifest.sourceCommit !== commit || manifest.sourceDirty) {
    const changed = execFileSync('git', ['diff', '--name-only', '--ignore-submodules=dirty', 'HEAD', '--', 'apps/web', 'packages', 'profiles', 'upstream.json'], { cwd: root, encoding: 'utf8' }).trim()
    throw new Error(`The local Web release candidate is not a clean package of this commit: version=${manifest.version}/${version}, commit=${manifest.sourceCommit}/${commit}, sourceDirty=${manifest.sourceDirty}, changed=${changed || '(none)'}`)
  }
  run('Pack this commit\'s Desktop feature composition', process.execPath, [join(root, 'apps/desktop', 'scripts', 'pack-workdsh-profile.mjs'), webRoot, releaseDirectory])
  const desktopManifestPath = join(releaseDirectory, 'release-manifest.json')
  const desktopManifest = JSON.parse(readFileSync(desktopManifestPath, 'utf8'))
  if (desktopManifest.sourceCommit !== commit || desktopManifest.sourceDirty) {
    throw new Error('The Desktop Profile archives are not a clean package of this commit')
  }
  // A Web release can supply its full composition and this reviewed Desktop
  // composition without shipping external features in the default Desktop.
  cpSync(desktopManifestPath, join(webReleaseDirectory, 'desktop-release-manifest.json'))
  for (const item of desktopManifest.packages) cpSync(join(releaseDirectory, item.filename), join(webReleaseDirectory, item.filename))
} else {
  const base = `https://github.com/hicms/EasyWork/releases/download/v${version}`
  const download = async (name, destination) => {
    const response = await fetch(`${base}/${name}`, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`Published Desktop Profile asset is unavailable: ${name} (${response.status})`)
    writeFileSync(destination, Buffer.from(await response.arrayBuffer()))
  }
  mkdirSync(releaseDirectory, { recursive: true })
  const manifestPath = join(releaseDirectory, 'release-manifest.json')
  await download('desktop-release-manifest.json', manifestPath)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  verifyProfileRelease(manifest, DSH_VERSION, RELEASE_PACKAGES)
  if (manifest.kind !== 'workdsh-desktop-source-candidate' || manifest.version !== version || manifest.sourceDirty || !/^[a-f0-9]{40}$/u.test(manifest.sourceCommit ?? '')) {
    throw new Error('Published Desktop Profile has invalid release provenance')
  }
  for (const item of manifest.packages) {
    if (!/^[a-z0-9][a-z0-9.-]*\.tgz$/u.test(item.filename) || !/^[a-f0-9]{64}$/u.test(item.sha256 ?? '')) {
      throw new Error('Published Desktop Profile has invalid archive metadata')
    }
    await download(item.filename, join(releaseDirectory, item.filename))
  }
  verifyReleaseArchives(manifest, releaseDirectory)
}

const runtimeEnv = { ...process.env, WORKDSH_RELEASE_DIRECTORY: releaseDirectory }
run('Prepare the single EasyWork DSH Profile', corepack, ['yarn', 'workspace', 'dsh-plugin-desktop', 'prepare:workdsh-runtime'], { env: runtimeEnv })
run('Prepare bundled Python and Node.js', corepack, ['yarn', 'workspace', 'dsh-plugin-desktop', 'prepare:workdsh-primary-runtime'], { env: runtimeEnv })
run('Prepare official command management adapters', corepack, ['yarn', 'workspace', 'dsh-plugin-desktop', 'prepare:workdsh-command'], { env: runtimeEnv })
run('Build the Desktop installer', process.execPath, [join(root, 'apps/desktop', 'scripts', platform === 'win32' ? 'package-win.ts' : 'package-mac.ts')], {
  env: { ...runtimeEnv, DSH_PACKAGE_CHECK_ALREADY_RAN: '1' },
})

console.log(`\nDesktop package completed using ${source === 'local' ? 'this commit\'s Web Profile' : 'the published Web Profile'}.`)
