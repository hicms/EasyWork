/** Signed Windows release only. Local unsigned packaging stays in package-win.ts. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, Platform, Arch } from 'electron-builder'
import { load } from 'js-yaml'
import { updateChannel, UPDATE_REPOSITORY } from '../src/update-policy.ts'
import { verifyWindowsInstaller } from './verify-win-installer.ts'
import { verifyUpdateArtifacts } from './verify-update-artifacts.mjs'
import { prepareInstallerSafety } from './windows-installer.mjs'

export function signedWindowsConfig({ env, platform, arch, version, channel }) {
  if (platform !== 'win32' || arch !== 'x64') throw new Error('Signed release requires native Windows x64')
  if (updateChannel(version) !== channel) throw new Error('Version and channel differ')
  for (const name of ['WIN_CSC_LINK', 'EASYWORK_WIN_PUBLISHER']) {
    if (!env[name]?.trim()) throw new Error(`Signed release requires ${name}`)
  }
  if (env.WIN_CSC_KEY_PASSWORD === undefined) throw new Error('Signed release requires WIN_CSC_KEY_PASSWORD')
  for (const name of ['ELECTRON_BUILDER_7ZIP_PATH', 'ELECTRON_BUILDER_NSIS_DIR', 'CSC_NAME', 'CSC_LINK']) {
    if (env[name]) throw new Error(`Signed release refuses ${name}`)
  }
  if (env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') throw new Error('Signing must not be disabled')
  const [owner, repo] = UPDATE_REPOSITORY.split('/')
  return {
    forceCodeSigning: true,
    extraMetadata: { easyworkUpdateTarget: 'nsis' },
    generateUpdatesFilesForAllChannels: false,
    publish: [{ provider: 'github', owner, repo, channel }],
    win: { signExecutable: true, verifyUpdateCodeSignature: true, signtoolOptions: {
      publisherName: env.EASYWORK_WIN_PUBLISHER, signingHashAlgorithms: ['sha256'],
    } },
    nsis: { differentialPackage: true, include: 'scripts/release-installer.nsh', deleteAppDataOnUninstall: false },
  }
}

export function verifySignature(path, publisher) {
  execFileSync('pwsh', ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./verify-win-signature.ps1', import.meta.url)),
    '-Path', path, '-Publisher', publisher], { stdio: 'inherit', windowsHide: true })
}

async function main() {
  const desktopRoot = resolve(import.meta.dirname, '..')
  const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'))
  const version = manifest.version
  const config = signedWindowsConfig({ env: process.env, platform: process.platform, arch: process.arch, version, channel: process.env.EASYWORK_RELEASE_CHANNEL })
  const safety = await prepareInstallerSafety()
  config.nsis = { ...config.nsis, ...safety.nsis }
  config.extraResources = safety.extraResources
  await build({ projectDir: desktopRoot, targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), publish: 'never', config })
  const artifacts = verifyWindowsInstaller({ desktopRoot, version })
  verifySignature(artifacts.installerPath, process.env.EASYWORK_WIN_PUBLISHER)
  verifySignature(artifacts.applicationPath, process.env.EASYWORK_WIN_PUBLISHER)
  const result = await verifyUpdateArtifacts(join(desktopRoot, 'dist'), version)
  const updateConfig = load(readFileSync(join(desktopRoot, 'dist/win-unpacked/resources/app-update.yml'), 'utf8'))
  const publisherNames = Array.isArray(updateConfig.publisherName) ? updateConfig.publisherName : [updateConfig.publisherName]
  if (updateConfig.provider !== 'github' || `${updateConfig.owner}/${updateConfig.repo}` !== UPDATE_REPOSITORY
    || !publisherNames.includes(process.env.EASYWORK_WIN_PUBLISHER)
    || !/^[a-zA-Z\d._-]+$/u.test(updateConfig.updaterCacheDirName ?? '')) throw new Error('Packaged updater signature/cache configuration is incomplete')
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: desktopRoot }).trim()
  const output = join(desktopRoot, 'dist', 'release')
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'release.json'), JSON.stringify({ sourceCommit, version, channel: updateChannel(version),
    publisher: process.env.EASYWORK_WIN_PUBLISHER, updaterCacheDirName: updateConfig.updaterCacheDirName, ...result }, null, 2) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
