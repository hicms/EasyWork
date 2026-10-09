#!/usr/bin/env node
/** Prepare a portable official runtime from verified, explicitly selected archives. */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { DSH_VERSION } from './runtime-version.mjs'
import { CATALOG_PACKAGES, UNSUPPORTED_ENTERPRISE_PACKAGES, PRODUCT_PACKAGES, RELEASE_PACKAGES } from './workdsh-package-boundary.mjs'
import { verifyDefaultComposition, verifyDefaultProfile, verifyInstalledDshVersions, verifyOfficialWebPackages, verifyPackageDshReferences, verifyProfileRelease, verifyReleaseArchives } from './verify-profile-release.mjs'
import { runtimeArchitecture, runtimeArchitectureYaml } from './runtime-architecture.mjs'
const architecture = runtimeArchitecture()
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(desktopRoot, 'build/workdsh-runtime')
const profile = join(output, 'profiles/workdsh')
const cache = join(output, 'package-cache')
const release = resolve(process.env.WORKDSH_RELEASE_DIRECTORY ?? join(desktopRoot, 'build/workdsh-profile-release'))
const manifestFile = join(release, 'release-manifest.json')
if (!existsSync(manifestFile)) throw new Error('Pack built current EasyWork sources with scripts/pack-workdsh-profile.mjs first, or select WORKDSH_RELEASE_DIRECTORY')
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
verifyProfileRelease(manifest, DSH_VERSION, RELEASE_PACKAGES)
verifyReleaseArchives(manifest, release)
const marker = JSON.stringify({ harness: DSH_VERSION, layout: 'five-feature-plugins-personal-only-v7', architecture, release: manifest })
const markerPath = join(profile, '.workdsh-desktop-release.json')
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', timeout: 1_200_000, ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`)
}
function verifyInstalled() {
  const base = readJson(join(profile, 'package.json'))
  verifyDefaultProfile(base)
  for (const [name, version] of Object.entries(CATALOG_PACKAGES)) {
    const installed = readJson(join(profile, 'node_modules', name, 'package.json'))
    if (installed.version !== version || base.dependencies?.[name] !== version || !base.dsh?.profile?.bundles?.includes(name)) {
      throw new Error('Pinned community catalog integration is missing: ' + name)
    }
  }
  for (const item of manifest.packages) {
    const pkg = readJson(join(profile, 'node_modules', item.name, 'package.json'))
    if (pkg.version !== item.version) throw new Error('Installed owned package version mismatch: ' + item.name)
    verifyPackageDshReferences(pkg, DSH_VERSION)
    if (UNSUPPORTED_ENTERPRISE_PACKAGES.includes(item.name) && (!pkg.exports?.['./desktop'] || pkg.peerDependencies?.['@deepseek-ai/dsh'] !== DSH_VERSION)) {
      throw new Error('Shipped enterprise package is missing the compatible Desktop entry: ' + item.name)
    }
  }
  // Official resolution traverses dependencies + peers, while its product
  // manager lists only dependencies. Derive a read-only installation anchor
  // from this one Profile project, without adding another package installation.
  const peers = { ...base.peerDependencies }
  for (const name of Object.keys(base.optionalDependencies ?? {})) peers[name] = readJson(join(profile, 'node_modules', name, 'package.json')).version
  const anchor = { ...base, name: 'workdsh-desktop-installation', peerDependencies: peers }
  delete anchor.optionalDependencies
  writeFileSync(join(profile, 'profile-installation.json'), JSON.stringify(anchor, null, 2) + '\n')
  verifyInstalledDshVersions(profile, DSH_VERSION)
  const require = createRequire(join(profile, 'package.json'))
  function resolveFrom(consumer, dependency) {
    return realpathSync(createRequire(require.resolve(consumer + '/package.json')).resolve(dependency + '/package.json'))
  }
  for (const [first, second, dependency] of [
    ['@deepseek-ai/dsh', '@deepseek-ai/dsh-config-editor', '@deepseek-ai/dsh-app-boot'],
    ['@deepseek-ai/dsh-agent-loop', '@deepseek-ai/dsh-agent-preset-registry', '@deepseek-ai/dsh-scope'],
  ]) if (resolveFrom(first, dependency) !== resolveFrom(second, dependency)) throw new Error('Split official module instance: ' + dependency)
  const lock = readFileSync(join(profile, 'pnpm-lock.yaml'), 'utf8')
  if (/file:(?:\/|[a-z]:)/iu.test(lock)) throw new Error('Runtime lock contains a build-machine path')
  const cli = join(profile, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
  const config = spawnSync(process.execPath, [cli, '--profile', 'workdsh', '--dump-config'], { env: { ...process.env, DSH_HOME: output }, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 })
  if (config.error || config.status !== 0) throw new Error('Official runtime composition failed: ' + (config.error ?? config.stderr))
  verifyOfficialWebPackages(manifest, profile, config.stdout)
  verifyDefaultComposition(config.stdout)
  for (const id of ['skillhub', 'dsh-market']) {
    if (!config.stdout.includes('id: ' + id)) throw new Error('Missing community catalog integration: ' + id)
  }
  for (const id of ['workdsh-installation-probe', 'workdsh-identity-local', 'workdsh-access', 'workdsh-audit']) {
    if (!config.stdout.includes('id: ' + id)) throw new Error('Missing required infrastructure: ' + id)
  }
  for (const name of ['workdsh-plugin-office', 'workdsh-plugin-activity']) {
    if (existsSync(join(profile, 'node_modules', name)) || config.stdout.includes('name: ' + name)) throw new Error('External feature was bundled by default: ' + name)
  }
  run(process.execPath, [join(desktopRoot, 'scripts/verify-product-plugin-inventory.mjs'), output])
}
let prepared = false
try { prepared = readFileSync(markerPath, 'utf8').trim() === marker; if (prepared) verifyInstalled() } catch { prepared = false }
if (!prepared) {
  // Build resources are replaceable; user Profiles are never touched here.
  const backup = output + '.before-ed01-' + Date.now()
  if (existsSync(output)) renameSync(output, backup)
  try {
    mkdirSync(profile, { recursive: true }); mkdirSync(cache, { recursive: true })
    cpSync(manifestFile, join(cache, 'release-manifest.json'))
    const dependencies = { '@deepseek-ai/dsh': DSH_VERSION, '@deepseek-ai/dsh-base': DSH_VERSION,
      '@deepseek-ai/dsh-web-app': DSH_VERSION, '@deepseek-ai/dsh-deepseek-account': DSH_VERSION,
      '@deepseek-ai/dsh-app-boot': DSH_VERSION, '@deepseek-ai/dsh-config-editor': DSH_VERSION,
      '@deepseek-ai/dsh-plugin-manager': DSH_VERSION, '@deepseek-ai/dsh-agent-loop': DSH_VERSION,
      '@deepseek-ai/dsh-agent-preset-registry': DSH_VERSION, '@deepseek-ai/dsh-scope': DSH_VERSION,
      '@deepseek-ai/dsh-tool-workspace-dependencies': DSH_VERSION, '@deepseek-ai/dsh-skill-office': DSH_VERSION,
      '@deepseek-ai/cordis-plugin-group': '1.0.4', ...manifest.requiredPeers, ...CATALOG_PACKAGES }
    const optionalDependencies = {}
    for (const item of manifest.packages) {
      cpSync(join(release, item.filename), join(cache, item.filename))
      const target = PRODUCT_PACKAGES.includes(item.name) ? dependencies : optionalDependencies
      target[item.name] = 'file:../../package-cache/' + item.filename
    }
    const pkg = { name: 'workdsh-desktop-profile', private: true, type: 'module', packageManager: 'pnpm@11.7.0', dependencies, optionalDependencies,
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', ...PRODUCT_PACKAGES, ...Object.keys(CATALOG_PACKAGES)] } } }
    writeFileSync(join(profile, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
    const overrides = Object.entries(manifest.runtimeOverrides ?? {}).map(([name, version]) => `  ${JSON.stringify(name)}: ${JSON.stringify(version)}`).join('\n')
    writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'autoInstallPeers: true\nstrictPeerDependencies: false\n' + runtimeArchitectureYaml(architecture) + 'overrides:\n' + overrides + '\n')
    run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'pnpm@11.7.0', '--dir', profile, 'install', '--prod', '--ignore-scripts'], { shell: process.platform === 'win32' })
    // Promote mandatory official peers into this installation's single root
    // graph, so CLI, Config Editor and Agent providers share module instances.
    for (let pass = 0; pass < 9; pass++) {
      const missing = new Map()
      for (const entry of readdirSync(join(profile, 'node_modules/@deepseek-ai'))) {
        const pkg = readJson(join(profile, 'node_modules/@deepseek-ai', entry, 'package.json'))
        for (const [name, range] of Object.entries(pkg.peerDependencies ?? {})) {
          if (!name.startsWith('@deepseek-ai/') || pkg.peerDependenciesMeta?.[name]?.optional) continue
          const version = manifest.runtimeOverrides?.[name] ?? (name.startsWith('@deepseek-ai/dsh') ? DSH_VERSION : range)
          const installed = join(profile, 'node_modules', name, 'package.json')
          if (!existsSync(installed) || (/^\d+\.\d+\.\d+(?:-[\w.]+)?$/u.test(version) && readJson(installed).version !== version)) missing.set(name, name + '@' + version)
        }
      }
      if (!missing.size) break
      if (pass === 8) throw new Error('Official runtime peer closure did not converge')
      run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--yes', 'pnpm@11.7.0', '--dir', profile, 'add', '--save-exact', '--ignore-scripts', ...missing.values()], { shell: process.platform === 'win32' })
    }
    const patches = RELEASE_PACKAGES.filter(name => !PRODUCT_PACKAGES.includes(name) && !UNSUPPORTED_ENTERPRISE_PACKAGES.includes(name))
      .map(name => join(profile, 'node_modules', name, 'cordis.patch.yml')).filter(existsSync)
      .map(path => readFileSync(path, 'utf8').trim())
    writeFileSync(join(profile, 'cordis.yml'), '[]\n')
    writeFileSync(join(profile, 'cordis.patch.yml'), patches.join('\n') + '\n')
    verifyInstalled()
    writeFileSync(markerPath, marker + '\n')
    rmSync(backup, { recursive: true, force: true })
  } catch (error) {
    rmSync(output, { recursive: true, force: true })
    if (existsSync(backup)) renameSync(backup, output)
    throw error
  }
}
cpSync(join(profile, 'package.json'), join(output, 'profile-package.json'))
console.log(`Prepared official DSH ${DSH_VERSION} with five default features and no preinstalled enterprise plugins at ${output}`)
