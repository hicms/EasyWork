import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { DSH_VERSION } from '../apps/desktop/scripts/runtime-version.mjs'

const root = resolve(import.meta.dirname, '..')
const readJson = path => JSON.parse(readFileSync(join(root, path), 'utf8'))
const upstream = readJson('upstream.json')
const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
const scope = process.argv[2]
if (process.argv.length !== 3 || !['desktop', 'web'].includes(scope)) {
  throw new Error('Usage: node scripts/verify-dsh-alignment.mjs desktop|web')
}

if (scope === 'desktop') {
  const problems = []
  if (upstream.version !== DSH_VERSION || upstream.distribution !== 'published-packages-and-desktop-release') problems.push('Desktop must consume the locked official release version')
  const targets = ['mac-arm64', 'mac-x64', 'win-x64']
  // Official pre-releases can publish platforms on different days; a listed target stays unbuildable until its lock is added.
  const pending = upstream.pendingDesktopArtifacts ?? []
  if (!Array.isArray(pending) || pending.some(target => !targets.includes(target) || target === 'win-x64')) problems.push('pendingDesktopArtifacts may list only unpublished macOS targets')
  for (const target of targets) {
    const artifact = upstream.desktopArtifacts?.[target]
    if (pending.includes(target)) {
      if (artifact) problems.push('Locked official release target is still marked pending: ' + target)
      else console.warn('Official release ' + DSH_VERSION + ' is not yet published for ' + target + '; that target cannot be built')
      continue
    }
    if (!artifact || !artifact.url.startsWith('https://download.deepseek.com/dsh-desk/bin/' + target + '/') || !artifact.url.includes('deepseek-harness-' + DSH_VERSION + '-') || Buffer.from(artifact.sha512 ?? '', 'base64').length !== 64 || !Number.isSafeInteger(artifact.size) || artifact.size <= 0) problems.push('Missing or invalid official release lock: ' + target)
  }
  const manifest = readJson('apps/desktop/package.json')
  for (const field of dependencyFields) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) {
        problems.push(`apps/desktop declares an extra DSH package in ${field}: ${name}`)
      }
    }
  }
  for (const name of Object.keys(readJson('package.json').resolutions ?? {})) {
    if (name.startsWith('@deepseek-ai/dsh')) problems.push(`root resolution retains old DSH package: ${name}`)
  }
  if (problems.length) {
    console.error(`Desktop DSH version alignment failed:\n${problems.join('\n')}`)
    process.exitCode = 1
  } else {
    console.log(`Desktop has one official DSH release version: ${DSH_VERSION}`)
  }
} else {
  const expected = upstream.version
  const webRoot = join(root, 'apps/web')
  const mismatches = []
  let checked = 0

  function checkManifest(path) {
    const manifest = JSON.parse(readFileSync(path, 'utf8'))
    for (const field of dependencyFields) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (!name.startsWith('@deepseek-ai/dsh')) continue
        checked++
        if (version !== expected) mismatches.push(`${relative(root, path)} ${field}.${name}: ${version}`)
      }
    }
  }

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') visit(path)
      } else if (entry.name === 'package.json') {
        checkManifest(path)
      }
    }
  }

  checkManifest(join(webRoot, 'package.json'))
  visit(join(root, 'packages'))
  visit(join(webRoot, 'examples'))
  if (checked === 0) throw new Error('No Web DSH dependencies found; alignment check is incomplete')
  if (mismatches.length > 0) {
    throw new Error(`Web dependencies differ from Desktop DSH ${expected}:\n${mismatches.join('\n')}`)
  }
  console.log(`Web and Desktop use DSH ${expected}; checked ${checked} Web dependency declarations.`)
}
