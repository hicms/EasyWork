/** Verify that the Electron carrier contains no second Harness runtime. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFile, listPackage } from '@electron/asar'
import { DSH_VERSION } from './runtime-version.mjs'
import { UNSUPPORTED_ENTERPRISE_PACKAGES, PRODUCT_PACKAGES, RELEASE_PACKAGES } from './easywork-package-boundary.mjs'
import { verifyReleaseProfileLayout } from './verify-profile-layout.mjs'
import { resolvePackagedExecutablePath } from './verify-electron-fuses.ts'
import { runtimeProfileDirectory } from '../src/runtime-layout.ts'
import { verifyDefaultComposition, verifyDefaultProfile, verifyInstalledDshVersions, verifyOfficialWebPackages, verifyProfileRelease, verifyReleaseArchives } from './verify-profile-release.mjs'

interface PackContext {
  appOutDir: string
  electronPlatformName: string
  packager: { appInfo: { productFilename: string } }
}

export function normalizeAsarEntry(entry: string): string {
  return entry.replaceAll('\\', '/').replace(/^\//u, '')
}

export async function afterPack(context: PackContext): Promise<void> {
  if (!process.versions.electron) {
    const inspection = { appOutDir: context.appOutDir, electronPlatformName: context.electronPlatformName,
      packager: { appInfo: { productFilename: context.packager.appInfo.productFilename } } }
    const result = spawnSync(resolvePackagedExecutablePath(context), ['--expose-internals', fileURLToPath(import.meta.url), JSON.stringify(inspection)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 180_000,
    })
    if (result.error || result.status !== 0) throw new Error('Packaged Electron runtime audit failed: ' + String(result.error ?? result.stderr))
    process.stdout.write(result.stdout)
    return
  }
  if (context.electronPlatformName === 'darwin') {
    const plist = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Info.plist')
    const nativeRole = spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Print :LSUIElement', plist], { encoding: 'utf8' })
    if (nativeRole.status !== 0 || nativeRole.stdout.trim() !== 'true') throw new Error('macOS carrier must start as a native UIElement before browser worker JavaScript runs')
  }
  const resources = context.electronPlatformName === 'darwin'
    ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : join(context.appOutDir, 'resources')
  const archive = join(resources, 'app.asar')
  if (existsSync(join(resources, 'easywork-config.json'))) throw new Error('Personal Desktop must not carry company deployment configuration')
  if (!existsSync(archive)) throw new Error(`Missing Electron carrier: ${archive}`)
  const entries = listPackage(archive, { isPack: false }).map(normalizeAsarEntry)
  if (!entries.includes('lib/easywork-main.js')) throw new Error('Electron carrier has no EasyWork entry point')
  if (!entries.includes('lib/startup-preload.cjs')) throw new Error('Electron carrier has no official Web boot bridge')
  if (!entries.includes('lib/startup-trace.mjs')) throw new Error('Electron carrier has no optional startup trace helper')
  if (entries.includes('lib/connection-preload.cjs')) throw new Error('Personal Desktop must not carry enterprise login preload')
  if (entries.some(entry => entry.startsWith('node_modules/'))) {
    throw new Error('Electron carrier contains duplicate node_modules; Harness must come only from the bundled Profile')
  }
  const manifest = JSON.parse(extractFile(archive, 'package.json').toString('utf8')) as {
    main?: string
    dependencies?: Record<string, string>
  }
  if (manifest.main !== 'lib/easywork-main.js' || Object.keys(manifest.dependencies ?? {}).length > 0) {
    throw new Error('Electron carrier must declare only the EasyWork entry point, without runtime dependencies')
  }

  const runtime = join(resources, 'easywork-runtime')
  // FFI loads a physical DLL path, not Electron's virtual ASAR path. Only its
  // platform payload packages may live beside the archive; never another DSH tree.
  const externalModules = join(resources, 'node_modules')
  if (readdirSync(externalModules).some(name => name !== '@trycua')
    || readdirSync(join(externalModules, '@trycua')).some(name => !/^cua-driver-(?:win32|darwin|linux)-[a-z0-9-]+$/u.test(name))) {
    throw new Error('Only native Cua platform payloads may live outside the archived Profile')
  }
  if (existsSync(join(runtime, 'node'))) {
    throw new Error('Desktop contains a duplicate Node runtime outside the official primary runtime')
  }
  const primary = JSON.parse(readFileSync(join(runtime, 'primary-runtime', 'runtime.json'), 'utf8')) as {
    desktopVersion?: string
    pnpm?: string
  }
  if (primary.desktopVersion !== DSH_VERSION) {
    throw new Error(`Bundled primary runtime is ${String(primary.desktopVersion)}, expected ${DSH_VERSION}`)
  }
  const profile = runtimeProfileDirectory(runtime)
  verifyReleaseProfileLayout(profile)
  const cache = join(runtime, 'package-cache')
  const release = JSON.parse(readFileSync(join(cache, 'release-manifest.json'), 'utf8')) as {
    packages: Array<{ name: string; version: string; filename: string; sha256: string }>
  }
  verifyProfileRelease(release, DSH_VERSION, RELEASE_PACKAGES)
  verifyReleaseArchives(release, cache)
  const archiveNameCheck = fileURLToPath(new URL('../../../scripts/verify-product-artifacts.mjs', import.meta.url))
  const archiveNames = spawnSync(process.execPath, [archiveNameCheck, cache], { encoding: 'utf8', timeout: 30_000 })
  if (archiveNames.error || archiveNames.status !== 0) throw new Error('Packaged plugin archive names failed: ' + String(archiveNames.error ?? archiveNames.stderr))
  process.stdout.write(archiveNames.stdout)
  verifyOfficialWebPackages(release, profile)
  const profileManifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    dsh?: { profile?: { bundles?: string[] } }
  }
  verifyDefaultProfile(profileManifest)
  const installation = JSON.parse(readFileSync(join(profile, 'profile-installation.json'), 'utf8')) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }
  if (JSON.stringify(installation.dependencies) !== JSON.stringify(profileManifest.dependencies) || installation.optionalDependencies !== undefined) {
    throw new Error('Installation anchor is not derived from the one default Profile manifest')
  }
  for (const name of Object.keys(profileManifest.optionalDependencies ?? {})) {
    const version = JSON.parse(readFileSync(join(profile, 'node_modules', name, 'package.json'), 'utf8')).version as string
    if (installation.peerDependencies?.[name] !== version) throw new Error('Installation infrastructure/enterprise peer differs from installed archive: ' + name)
  }
  const productPackages = new Set(PRODUCT_PACKAGES)
  const selected = profileManifest.dsh?.profile?.bundles ?? []
  const selectedEasyWork = selected.filter(name => name.startsWith('easywork-'))
  const directEasyWork = Object.keys(profileManifest.dependencies ?? {}).filter(name => name.startsWith('easywork-'))
  if (selectedEasyWork.length !== productPackages.size || selectedEasyWork.some(name => !productPackages.has(name))) {
    throw new Error(`Desktop must select exactly five EasyWork product bundles, found ${selectedEasyWork.join(', ')}`)
  }
  if (directEasyWork.length !== productPackages.size || directEasyWork.some(name => !productPackages.has(name))) {
    throw new Error(`Desktop must directly install exactly five EasyWork product bundles, found ${directEasyWork.join(', ')}`)
  }
  const lockfile = readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8')
  for (const item of release.packages) {
    if (!existsSync(join(cache, item.filename))) throw new Error(`Bundled plugin archive is missing: ${item.filename}`)
    const installed = JSON.parse(readFileSync(join(profile, 'node_modules', item.name, 'package.json'), 'utf8')) as { version?: string; exports?: Record<string, unknown>; peerDependencies?: Record<string, string> }
    if (installed.version !== item.version) throw new Error(`Bundled owned version mismatch: ${item.name}`)
    if (!productPackages.has(item.name) && Object.hasOwn(profileManifest.dependencies ?? {}, item.name)) {
      throw new Error(`Internal EasyWork service is a direct product dependency: ${item.name}`)
    }
    const dependencies = productPackages.has(item.name) ? profileManifest.dependencies : profileManifest.optionalDependencies
    if (dependencies?.[item.name]?.replaceAll('\\', '/') !== `file:../../package-cache/${item.filename}`) {
      throw new Error(`Bundled ${item.name} must use a portable archive path in its expected dependency section`)
    }
    if (UNSUPPORTED_ENTERPRISE_PACKAGES.includes(item.name) && (!installed.exports?.['./desktop'] || installed.peerDependencies?.['@deepseek-ai/dsh'] !== DSH_VERSION)) {
      throw new Error(`Shipped ${item.name} has no compatible Desktop enterprise entry`)
    }
  }
  const patch = readFileSync(join(profile, 'cordis.patch.yml'), 'utf8')
  verifyDefaultComposition(patch)
  for (const name of release.packages.map(item => item.name).filter(name => !productPackages.has(name) && !UNSUPPORTED_ENTERPRISE_PACKAGES.includes(name))) {
    if (['easywork-contracts', 'easywork-ui', 'easywork-provider-browser-session'].includes(name)) continue // inserted by the bundle patch
    if (!patch.includes(`name: ${name}`)) throw new Error(`Internal EasyWork service is missing from Profile patch: ${name}`)
  }
  if (/file:(?:\/|[a-z]:)/iu.test(lockfile)) {
    throw new Error('Bundled plugin lockfile contains a build-machine path')
  }
  const packages = join(profile, 'node_modules', '@deepseek-ai')
  const names = readdirSync(packages).filter(name => name === 'dsh' || name.startsWith('dsh-'))
  const instances = verifyInstalledDshVersions(profile, DSH_VERSION)
  const node = join(runtime, 'primary-runtime', 'dependencies', 'node', 'bin',
    context.electronPlatformName === 'win32' ? 'node.exe' : 'node')
  // Official release binaries carry the upstream signing identity. The owned
  // package must permit separately published native plugin dependencies; final
  // Developer ID signing, when requested, follows this afterPack check.
  if (context.electronPlatformName === 'darwin') {
    const entitlements = fileURLToPath(new URL('./node-runtime-entitlements.plist', import.meta.url))
    const signed = spawnSync('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', '--entitlements', entitlements, node], { encoding: 'utf8', timeout: 30_000 })
    if (signed.error || signed.status !== 0) throw new Error('Packaged Node runtime signing failed: ' + String(signed.error ?? signed.stderr))
  }
  const native = spawnSync(process.execPath, ['--expose-internals', '--input-type=module', '-e',
    "import { createRequire } from 'node:module'; const root = createRequire(process.argv[1]); createRequire(root.resolve('@deepseek-ai/cordis-plugin-loader'))('node-addon-require-builtin'); console.log('native runtime load passed')", join(profile, 'package.json')],
    { encoding: 'utf8', timeout: 30_000 })
  if (native.error || native.status !== 0) throw new Error('Packaged Node cannot load the official native plugin dependency: ' + String(native.error ?? native.stderr))
  process.stdout.write(native.stdout)
  const pnpm = join(runtime, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.cjs')
  if (primary.pnpm !== '11.7.0' || !existsSync(pnpm)) throw new Error('Packaged official pnpm CLI is missing or has another version')
  const packageManager = spawnSync(node, [pnpm, '--version'], { encoding: 'utf8', timeout: 30_000 })
  if (packageManager.error || packageManager.status !== 0 || packageManager.stdout.trim() !== primary.pnpm) {
    throw new Error('Packaged official pnpm JavaScript CLI cannot run with its bundled Node')
  }
  const inventoryCheck = fileURLToPath(new URL('./verify-product-plugin-inventory.mjs', import.meta.url))
  const inventory = spawnSync(process.execPath, ['--expose-internals', inventoryCheck, runtime], {
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (inventory.error || inventory.status !== 0) {
    throw new Error(`Packaged EasyWork plugin inventory check failed: ${String(inventory.error ?? inventory.stderr)}`)
  }
  process.stdout.write(inventory.stdout)
  const registryCheck = fileURLToPath(new URL('./verify-runtime-product-names.mjs', import.meta.url))
  const registries = spawnSync(resolvePackagedExecutablePath(context), ['--expose-internals', registryCheck, runtime], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 120_000,
  })
  if (registries.error || registries.status !== 0) throw new Error('Packaged Skill/MCP names failed: ' + String(registries.error ?? registries.stderr))
  process.stdout.write(registries.stdout)
  console.log(`Verified thin Electron carrier and ${names.length} root / ${instances} total Harness ${DSH_VERSION} package instances`)
}

export default afterPack

if (process.versions.electron && process.argv[1] === fileURLToPath(import.meta.url)) {
  await afterPack(JSON.parse(process.argv[2]!) as PackContext)
}
