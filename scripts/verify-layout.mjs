import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { RELEASE_PACKAGES, PACKAGE_DIRECTORIES } from '../apps/desktop/scripts/easywork-package-boundary.mjs'

const root = resolve(import.meta.dirname, '..')
const readJson = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'))
const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
}).trim()
const fail = message => { throw new Error(`verify-layout: ${message}`) }

const workspace = readJson('package.json')
const upstream = readJson('upstream.json')
const stablePlugin = readJson('apps/desktop/package.json')

if (stablePlugin.name !== 'dsh-plugin-desktop') fail('the stable Desktop workspace must retain dsh-plugin-desktop')
if (upstream.distribution !== 'published-packages-and-desktop-release' || typeof upstream.version !== 'string') {
  fail('the official release distribution and version must be recorded')
}

if (workspace.packageManager !== 'yarn@4.18.0') {
  fail('the product workspace must pin yarn@4.18.0')
}
if (JSON.stringify(workspace.workspaces) !== JSON.stringify(['apps/desktop'])) {
  fail('the root Yarn workspace must contain only the Desktop carrier')
}
for (const [name, manifest] of [['dsh-plugin-desktop', stablePlugin]]) {
  if (manifest.packageManager !== undefined) fail(`${name} must inherit the root Yarn release`)
}
const claudePath = resolve(root, 'CLAUDE.md')
const claudeStat = lstatSync(claudePath)
// Windows checkouts materialize the symlink as a regular file holding the
// target name; accept both forms so the pointer stays verified on every host.
const claudeTarget = claudeStat.isSymbolicLink()
  ? readlinkSync(claudePath)
  : readFileSync(claudePath, 'utf8').trim()
if (claudeTarget !== 'AGENTS.md') {
  fail('CLAUDE.md must link to the outer repository AGENTS.md')
}
for (const legacyFile of [
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'apps/desktop/pnpm-lock.yaml',
  'apps/desktop/pnpm-workspace.yaml',
]) {
  if (existsSync(resolve(root, legacyFile))) fail(`${legacyFile} must not exist`)
}
for (const [owner, manifest] of [
  ['root', workspace],
  ['stable desktop', stablePlugin],
]) {
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'resolutions']) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (typeof range !== 'string') continue
      if (/^(?:workspace|portal|link):/u.test(range)
        || (range.startsWith('file:') && range.includes('deepseek-harness'))) {
        fail(`${owner} ${field}.${name} bypasses the published DSH package boundary`)
      }
    }
  }
}

if (run('git', ['ls-files', '--stage', '--', 'deepseek-harness']).startsWith('160000')) fail('Official source must not be a build dependency')
if (Object.keys(stablePlugin.dependencies ?? {}).some(name => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))) {
  fail('the Electron carrier must not directly depend on a second DSH runtime')
}

process.stdout.write(`verify-layout: one Electron carrier and official release ${upstream.version} are consistent\n`)

for (const name of RELEASE_PACKAGES) {
  const directory = resolve(root, 'apps/web', PACKAGE_DIRECTORIES[name])
  if (!existsSync(resolve(directory, 'package.json'))) fail('missing package directory ' + name)
  const manifest = readJson(resolve(directory, 'package.json'))
  for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
    if (peer.startsWith('easywork-') && !manifest.peerDependenciesMeta?.[peer]?.optional && !RELEASE_PACKAGES.includes(peer)) {
      fail(name + ' requires unshipped ' + peer)
    }
  }
}
for (const file of run('git', ['ls-files', '--', 'apps', 'scripts', '.github']).split(/\r?\n/u)) {
  if (!/\.(?:mjs|ts|json|ya?ml)$/u.test(file) || !existsSync(resolve(root, file))) continue
  const text = readFileSync(resolve(root, file), 'utf8')
  if (/(?:\.\.?\/|\b)dsh-plugin-desktop\/(?:scripts|src|tests|build)/u.test(text)) fail(file + ' uses retired Desktop directory')
}
const ci = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
if (!ci.includes('  desktop-check:') || !ci.includes('  web-check:') || /^\s+(?:-\s+)?if:/m.test(ci)) {
  fail('manual CI must always verify Desktop and Web including shared packages')
}
for (const name of ['easywork-provider-identity-enterprise', 'easywork-plugin-enterprise-collaboration']) {
  if (!ci.includes(`pnpm --filter ${name} build`) || !ci.includes(`pnpm --filter ${name} typecheck`)) {
    fail('Web CI must build and typecheck ' + name)
  }
}
console.log('Verified delivery directories, owned dependency closure and shared CI coverage')
