/** Writable Profile/configuration over the official installation anchor. No custom Loader. */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { load, dump } from 'js-yaml'
import { syncBundledCompatibility } from './runtime-compatibility.ts'
import { cachedPackageManager } from './plugin-archive-cache.ts'

type ProfilePackage = { dependencies?: Record<string, string>, optionalDependencies?: Record<string, string>, dsh?: { profile?: { bundles?: string[] } }, [key: string]: unknown }
const BASE_STATE = '.workdsh-desktop-base.json'
const json = (file: string): ProfilePackage => JSON.parse(readFileSync(file, 'utf8')) as ProfilePackage
const writeJson = (file: string, value: unknown): void => writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
function memberDefaults(release: ProfilePackage): ProfilePackage {
  return { name: 'workdsh-member-profile', private: true, type: 'module', packageManager: release.packageManager,
    dependencies: {}, ...(release.dsh ? { dsh: structuredClone(release.dsh) } : {}) }
}
function baseDigest(source: string, base: ProfilePackage, version: string): string {
  const marker = join(source, '.workdsh-desktop-release.json')
  const workspace = join(source, 'pnpm-workspace.yaml')
  return createHash('sha256').update('installation-owned-defaults-v2').update(JSON.stringify(base)).update(version).update(existsSync(marker) ? readFileSync(marker) : '')
    .update(existsSync(workspace) ? readFileSync(workspace) : '').digest('hex')
}

function updatePackagePolicy(source: string, target: string): boolean {
  const policy = join(source, 'pnpm-workspace.yaml'), current = join(target, 'pnpm-workspace.yaml')
  if (!existsSync(policy)) return false
  const parse = (path: string): Record<string, unknown> => {
    const value = load(readFileSync(path, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Profile 包管理配置必须是 YAML 对象')
    return value as Record<string, unknown>
  }
  if (!existsSync(current)) {
    const defaults = parse(policy)
    // Like the official external Profile initializer, use installation-owned service peers.
    defaults.autoInstallPeers = false
    writeFileSync(current, dump(defaults), { mode: 0o600 })
    return true
  }
  const owned = parse(policy), user = parse(current)
  if (JSON.stringify(user.overrides) === JSON.stringify(owned.overrides)) return false
  if ((user.overrides !== undefined && (!user.overrides || typeof user.overrides !== 'object' || Array.isArray(user.overrides)))
    || !owned.overrides || typeof owned.overrides !== 'object' || Array.isArray(owned.overrides)) throw new Error('Profile 包版本约束无效')
  // Official runtime/Cordis versions are product-owned. Other install preferences and overrides are user-owned.
  const overrides = { ...user.overrides as Record<string, unknown>, ...owned.overrides as Record<string, unknown> }
  if (JSON.stringify(user.overrides) === JSON.stringify(overrides)) return false
  user.overrides = overrides
  writeFileSync(current, dump(user), { mode: 0o600 })
  return true
}

export function materializeRuntimeProfile(source: string, home: string): { profile: string, changed: boolean } {
  const target = join(home, 'profiles', 'workdsh')
  const release = json(join(source, 'package.json'))
  // Defaults are already installed in the immutable runtime. The member project owns only explicit additions.
  const base = memberDefaults(release)
  const version = json(join(source, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')).version
  if (typeof version !== 'string') throw new Error('Bundled DSH version is missing')
  const state = join(target, BASE_STATE)
  const manifest = join(target, 'package.json')
  const modules = join(target, 'node_modules')
  mkdirSync(target, { recursive: true, mode: 0o700 })
  // A previous shared symlink is not safe for plugin writes. Refuse to mutate it.
  if (existsSync(modules) && lstatSync(modules).isSymbolicLink()) throw new Error('此 Profile 的依赖仍链接到安装包，请选择独立的可写空间后再启动')
  const digest = baseDigest(source, release, version)
  const previous = existsSync(state) ? JSON.parse(readFileSync(state, 'utf8')) as { digest: string, base: ProfilePackage, pendingInstallation?: boolean } : undefined
  let changed = previous?.pendingInstallation === true
  if (!existsSync(manifest)) {
    writeJson(manifest, base)
    writeFileSync(join(target, 'cordis.patch.yml'), '[]\n', { mode: 0o600 })
  } else if (previous?.digest !== digest) {
    if (!previous) throw new Error('已有 Profile 缺少 Desktop 版本记录；请在官方插件管理中核对后使用独立空间')
    const current = json(manifest)
    for (const section of ['dependencies', 'optionalDependencies'] as const) {
      const owned = previous.base[section] ?? {}
      const next = base[section] ?? {}
      current[section] ??= {}
      for (const [name, value] of Object.entries(owned)) {
        if (current[section]![name] !== value) continue // Explicit user removal/change remains owned by the user.
        if (next[name] === undefined) delete current[section]![name]
        else current[section]![name] = next[name]!
      }
      for (const [name, value] of Object.entries(next)) {
        if (owned[name] === undefined && current[section]![name] === undefined) current[section]![name] = value
      }
    }
    const selected = current.dsh?.profile?.bundles ?? []
    const oldBundles = previous.base.dsh?.profile?.bundles ?? []
    const nextBundles = base.dsh?.profile?.bundles ?? []
    current.dsh ??= {}; current.dsh.profile ??= {}
    current.dsh.profile.bundles = selected.filter(name => !oldBundles.includes(name) || nextBundles.includes(name))
    for (const name of nextBundles) if (!oldBundles.includes(name) && !current.dsh.profile.bundles.includes(name)) current.dsh.profile.bundles.push(name)
    if (JSON.stringify(json(manifest)) !== JSON.stringify(current)) {
      writeJson(manifest, current)
      // Only a changed local dependency graph requires package installation, not a refreshed bundle selection.
      changed ||= ['dependencies', 'optionalDependencies'].some(section => JSON.stringify(previous.base[section]) !== JSON.stringify(base[section])) && existsSync(modules)
    }
  }
  const policyChanged = updatePackagePolicy(source, target)
  if (policyChanged && existsSync(modules)) changed = true
  const cache = join(home, 'package-cache')
  const sourceCache = join(source, '..', '..', 'package-cache')
  if (existsSync(sourceCache)) cpSync(sourceCache, cache, { recursive: true, force: false, errorOnExist: false })
  syncBundledCompatibility(source, target, digest)
  // Caller installs changed dependencies with the pinned official package manager before marking success.
  if (changed) writeJson(state, { digest: previous?.digest ?? digest, base: previous?.base ?? base, pendingInstallation: true })
  else writeJson(state, { digest, base })
  return { profile: target, changed }
}

export function markProfileUpdated(source: string, profile: string): void {
  const release = json(join(source, 'package.json'))
  const base = memberDefaults(release)
  const version = json(join(source, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')).version as string
  const digest = baseDigest(source, release, version)
  writeJson(join(profile, BASE_STATE), { digest, base })
}

export function officialLauncher(source: string, home: string, executable: string, packageManager: string = join(dirname(executable), '..', '..', 'pnpm', 'bin', 'pnpm.cjs')): string {
  const cli = join(source, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!existsSync(cli) || !existsSync(packageManager)) throw new Error('安装包缺少官方 DSH 或锁定的插件安装工具')
  const pnpm = cachedPackageManager(home, packageManager)
  const launcher = join(home, '.workdsh-launch.mjs')
  writeFileSync(launcher, `import { runCli } from ${JSON.stringify(pathToFileURL(cli).href)};\nawait runCli({ manageDesktopProfile: true, packageManager: { command: ${JSON.stringify(executable)}, args: [${JSON.stringify(pnpm)}] } });\n`, { mode: 0o600 })
  return launcher
}

/** The official application-owned Profile API supplies the full installation dependency graph. */
export function officialHostLauncher(source: string, home: string, executable: string, packageManager: string, patches: string[]): string {
  const boot = join(source, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'profile-boot.js')
  const appBoot = join(source, 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js')
  if (!existsSync(boot) || !existsSync(appBoot) || !existsSync(packageManager)) throw new Error('安装包缺少官方 Profile 启动接口')
  const anchor = join(source, 'profile-installation.json'), profile = join(home, 'profiles', 'workdsh')
  if (!existsSync(anchor)) throw new Error('安装包缺少完整官方与 EasyWork 安装清单')
  const launcher = join(home, '.workdsh-host.mjs')
  packageManager = cachedPackageManager(home, packageManager)
  writeFileSync(launcher, `import { runProfile } from ${JSON.stringify(pathToFileURL(boot).href)};
import { loadProfileDirectory, loadLayeredEnv, reportSkippedBundles } from ${JSON.stringify(pathToFileURL(appBoot).href)};
const installAnchor = ${JSON.stringify(anchor)};
const profile = loadProfileDirectory('dsh', ${JSON.stringify(profile)}, installAnchor);
reportSkippedBundles('dsh', profile);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try {
    const running = await application;
    await running.shutdown.shutdown(0);
    if (process.connected) {
      await new Promise((resolve, reject) => process.send({ type: 'workdsh-shutdown-complete' }, error => error ? reject(error) : resolve()));
      process.disconnect();
    }
  } catch (error) { console.error('EasyWork Host shutdown failed:', error); process.exit(1); }
}
process.on('message', message => { if (message?.type === 'workdsh-shutdown') void stop(); });
const application = runProfile({ environment: loadLayeredEnv('dsh'), profile: 'workdsh', resolvedProfile: { profile, installAnchor }, patchFiles: ${JSON.stringify(patches)}, args: process.argv.slice(2), packageManager: { command: ${JSON.stringify(executable)}, args: [${JSON.stringify(packageManager)}] } });
const { ctx } = await application;
if (!stopping && process.connected) process.send?.({ type: 'workdsh-ready', url: ctx.connection.authenticatedUrl('http://127.0.0.1:' + ctx.webServer.port), injections: ctx.webServer.collectIndexInjections() });
`, { mode: 0o600 })
  return launcher
}
