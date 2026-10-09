#!/usr/bin/env node
import { createRequire } from 'node:module'
/** Pack built owned sources, never a running Profile or its credentials. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DSH_VERSION } from './runtime-version.mjs'
import { RELEASE_PACKAGES, PACKAGE_DIRECTORIES } from './workdsh-package-boundary.mjs'
import { verifyBuiltPackageExports, verifyPackageDshReferences, verifyProfileRelease } from './verify-profile-release.mjs'
const source = process.argv[2] && resolve(process.argv[2])
const output = resolve(process.argv[3] ?? fileURLToPath(new URL('../build/workdsh-profile-release', import.meta.url)))
if (!source) throw new Error('Usage: node scripts/pack-workdsh-profile.mjs <built-workdsh-source> [output]')
if (existsSync(output)) throw new Error('Use a fresh release directory; candidate archives are immutable')
const project = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
if (project.devDependencies?.['@deepseek-ai/dsh'] !== DSH_VERSION) throw new Error('EasyWork source and Desktop must target the same official DSH version')
const sourceRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: source, encoding: 'utf8' }).trim()
const sourcePath = relative(sourceRoot, source) || '.'
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim()
const sourceDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', sourcePath, 'packages', 'profiles', 'upstream.json'], { cwd: sourceRoot, encoding: 'utf8' }).trim().length > 0
const pnpm = join(source, 'node_modules/pnpm/bin/pnpm.cjs')
const packages = []
const requiredPeers = {}
mkdirSync(output, { recursive: true })
for (const name of RELEASE_PACKAGES) {
  const directory = join(source, PACKAGE_DIRECTORIES[name])
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  if (pkg.name !== name) throw new Error('Unexpected source package: ' + directory)
  verifyPackageDshReferences(pkg, DSH_VERSION)
  verifyBuiltPackageExports(pkg, directory)
  for (const [peer, range] of Object.entries(pkg.peerDependencies ?? {})) {
    if (pkg.peerDependenciesMeta?.[peer]?.optional) continue
    if (peer.startsWith('workdsh-')) {
      if (!RELEASE_PACKAGES.includes(peer)) throw new Error('Missing owned runtime dependency: ' + name + ' requires ' + peer)
      continue
    }
    const version = project.pnpm?.overrides?.[peer] ?? JSON.parse(readFileSync(createRequire(join(directory, 'package.json')).resolve(peer + '/package.json'), 'utf8')).version
    if (requiredPeers[peer] && requiredPeers[peer] !== version) throw new Error('Conflicting runtime peer: ' + peer)
    requiredPeers[peer] = version
  }
  execFileSync(process.execPath, [pnpm, 'pack', '--pack-destination', output], { cwd: directory, stdio: 'pipe' })
  const packed = `${name}-${pkg.version}.tgz`
  const sha256 = createHash('sha256').update(readFileSync(join(output, packed))).digest('hex')
  const filename = `${name}-${pkg.version}-${sha256.slice(0, 16)}.tgz`
  renameSync(join(output, packed), join(output, filename))
  packages.push({ name, version: pkg.version, filename, sha256 })
}
const { officialWebClients } = await import(pathToFileURL(join(source, 'scripts/official-web-clients.mjs')).href)
const official = await officialWebClients()
if (official.version !== DSH_VERSION) throw new Error('Official Web exporter and Desktop version differ')
const officialWeb = { sources: official.sources, clients: official.clients.map(({ id, package: name, conditional }) => ({ id, package: name, conditional })) }
const manifest = { kind: 'workdsh-desktop-source-candidate', version: project.version, harness: DSH_VERSION, sourceCommit, sourceDirty,
  runtimeOverrides: project.pnpm?.overrides ?? {}, requiredPeers, packages, officialWeb }
verifyProfileRelease(manifest, DSH_VERSION, RELEASE_PACKAGES)
writeFileSync(join(output, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Packed ${packages.length} owned packages for personal DSH ${DSH_VERSION}; five default features selected`)
