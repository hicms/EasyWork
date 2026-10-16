/** Shared NSIS safety for signed releases and explicitly unsigned acceptance builds. */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, Platform, Arch } from 'electron-builder'
import { getPath7za } from 'app-builder-lib/out/toolsets/7zip.js'
import { verifyLinkedBuilderPatch } from './verify-builder-patch.mjs'
import { releaseTag, UPDATE_REPOSITORY } from '../src/update-policy.ts'
import { hashFile } from './verify-update-artifacts.mjs'
import { verifyReleaseSource } from '../../../scripts/desktop-release-policy.mjs'

const desktopRoot = resolve(import.meta.dirname, '..')

export function unsignedWindowsConfig(version, updates = false) {
  if (updates) releaseTag(version, 'unsigned-acceptance')
  const [owner, repo] = UPDATE_REPOSITORY.split('/')
  return {
    nsis: { differentialPackage: updates },
    extraMetadata: { easyworkUpdateTarget: updates ? 'nsis-acceptance' : 'disabled' },
    win: { signExecutable: false, verifyUpdateCodeSignature: false },
    forceCodeSigning: false, npmRebuild: false, generateUpdatesFilesForAllChannels: false,
    publish: updates ? [{ provider: 'github', owner, repo, channel: 'alpha', releaseType: 'prerelease' }] : null,
  }
}

export async function prepareInstallerSafety() {
  verifyLinkedBuilderPatch()
  for (const name of ['ELECTRON_BUILDER_7ZIP_PATH', 'ELECTRON_BUILDER_NSIS_DIR']) {
    if (process.env[name]) throw new Error(`EasyWork installer refuses ${name}`)
  }
  process.env.EASYWORK_NSIS_7ZA = await getPath7za()
  process.env.EASYWORK_NSIS_PROCESS_CHECK = Buffer.from(readFileSync(new URL('./installer-process-check.ps1', import.meta.url), 'utf8'), 'utf16le').toString('base64')
  const extractorDirectory = dirname(dirname(process.env.EASYWORK_NSIS_7ZA))
  const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'))
  return {
    nsis: { include: 'scripts/release-installer.nsh', deleteAppDataOnUninstall: false },
    extraResources: [...manifest.build.extraResources,
      { from: join(extractorDirectory, 'LICENSE.txt'), to: 'licenses/7zip-LICENSE.txt' },
      { from: join(extractorDirectory, 'COPYING'), to: 'licenses/7zip-COPYING.txt' },
    ],
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Unsigned acceptance installer requires native Windows x64')
  process.chdir(desktopRoot)
  const safety = await prepareInstallerSafety()
  const { version } = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'))
  const updates = process.argv.includes('--updates')
  const config = unsignedWindowsConfig(version, updates)
  let sourceCommit
  if (updates) {
    const git = args => execFileSync('git', args, { cwd: desktopRoot, encoding: 'utf8' }).trim()
    if (git(['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Acceptance updates require clean committed source')
    sourceCommit = git(['rev-parse', 'HEAD'])
    verifyReleaseSource({ commit: sourceCommit, version, channel: 'alpha', root: desktopRoot,
      defaultBranch: process.env.DEFAULT_BRANCH ?? git(['symbolic-ref', 'refs/remotes/origin/HEAD']).replace('refs/remotes/origin/', '') })
    const profile = JSON.parse(readFileSync(join(desktopRoot, 'build/easywork-runtime/package-cache/release-manifest.json'), 'utf8'))
    if (profile.sourceCommit !== sourceCommit || profile.sourceDirty !== false) throw new Error('Prepared Profile must match clean release source')
    config.extraMetadata.easyworkSourceCommit = sourceCommit
  }
  for (const name of Object.keys(process.env)) if (/^(?:WIN_)?CSC_/u.test(name)) delete process.env[name]
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  await build({ projectDir: desktopRoot, targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64), publish: 'never', config: {
    ...safety, ...config, nsis: { ...safety.nsis, ...config.nsis },
  } })
  if (updates) writeFileSync(join(desktopRoot, 'dist/unsigned-update-build.json'), JSON.stringify({ sourceCommit, version,
    builtAt: new Date().toISOString(),
    installerSha512: await hashFile(join(desktopRoot, `dist/EasyWork-${version}-x64-Setup.exe`)),
    asarSha512: await hashFile(join(desktopRoot, 'dist/win-unpacked/resources/app.asar')),
  }, null, 2) + '\n')
}
