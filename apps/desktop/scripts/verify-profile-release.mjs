import { UNSUPPORTED_ENTERPRISE_PACKAGES, PRODUCT_PACKAGES, RELEASE_PACKAGES } from './workdsh-package-boundary.mjs'
import { createHash } from 'node:crypto'
import { existsSync, globSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path'

export function verifyReleaseArchives(manifest, directory) {
  for (const item of manifest.packages ?? []) {
    if (!/^[a-z0-9][a-z0-9.-]*\.tgz$/u.test(item.filename) || !/^[a-f0-9]{64}$/u.test(item.sha256 ?? '')) {
      throw new Error('Invalid owned archive metadata: ' + item.name)
    }
    if (createHash('sha256').update(readFileSync(join(directory, item.filename))).digest('hex') !== item.sha256) {
      throw new Error('Owned archive digest mismatch: ' + item.name)
    }
  }
}

/** Check transitive pnpm instances too, not just the root package symlinks. */
export function verifyInstalledDshVersions(profile, expectedDshVersion) {
  const modules = join(profile, 'node_modules')
  const store = join(modules, '.pnpm')
  const scopes = [join(modules, '@deepseek-ai')]
  if (existsSync(store)) for (const entry of readdirSync(store)) scopes.push(join(store, entry, 'node_modules', '@deepseek-ai'))
  const instances = new Set()
  for (const scope of scopes) {
    if (!existsSync(scope)) continue
    for (const name of readdirSync(scope).filter(name => name === 'dsh' || name.startsWith('dsh-'))) {
      const path = realpathSync(join(scope, name, 'package.json'))
      if (instances.has(path)) continue
      instances.add(path)
      const pkg = JSON.parse(readFileSync(path, 'utf8'))
      if (pkg.version !== expectedDshVersion) throw new Error(`Installed ${pkg.name} is ${pkg.version}; expected ${expectedDshVersion}`)
    }
  }
  if (!instances.size) throw new Error('Installation has no official DSH packages')
  return instances.size
}

export function verifyOfficialWebPackages(manifest, profile, config) {
  const roster = manifest.officialWeb
  if (!roster?.clients?.length || roster.sources?.length !== 2) throw new Error('Missing shared official Web roster')
  for (const source of roster.sources) {
    if (!['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'].includes(source.package) || source.file !== 'cordis.patch.yml') throw new Error('Invalid official composition source')
    const patch = readFileSync(join(profile, 'node_modules', source.package, source.file))
    if (createHash('sha256').update(patch).digest('hex') !== source.sha256) throw new Error('Official Web composition differs from the shared exporter: ' + source.package)
  }
  const seen = new Set()
  for (const client of roster.clients) {
    if (seen.has(client.package)) throw new Error('Duplicate official Web client: ' + client.package)
    seen.add(client.package)
    if (config !== undefined && (!config.includes('id: ' + client.id) || !config.includes(client.package))) throw new Error('Official Web client missing from composition: ' + client.package)
  }
}

export function verifyDefaultProfile(manifest) {
  const selected = (manifest.dsh?.profile?.bundles ?? []).filter(name => name.startsWith('workdsh-')).sort()
  const direct = Object.keys(manifest.dependencies ?? {}).filter(name => name.startsWith('workdsh-')).sort()
  const installed = [...direct, ...Object.keys(manifest.optionalDependencies ?? {}).filter(name => name.startsWith('workdsh-'))].sort()
  for (const [kind, actual, expected] of [
    ['selected features', selected, PRODUCT_PACKAGES],
    ['direct features', direct, PRODUCT_PACKAGES],
    ['owned dependency closure', installed, [...RELEASE_PACKAGES].sort()],
  ]) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Desktop ${kind} changed: expected ${expected.join(', ')}, found ${actual.join(', ')}`)
    }
  }
}

/** Shipping enterprise code must not silently activate it in the personal composition. */
export function verifyDefaultComposition(config) {
  for (const name of UNSUPPORTED_ENTERPRISE_PACKAGES) {
    if (config.includes(name)) throw new Error('Enterprise package is active in the default personal composition: ' + name)
  }
}

export function verifyProfileRelease(manifest, expectedDshVersion, expectedPackages) {
  if (manifest?.harness !== expectedDshVersion) {
    throw new Error(`EasyWork release targets DSH ${manifest?.harness ?? 'unknown'}, but Desktop pins ${expectedDshVersion}`)
  }
  for (const [name, version] of Object.entries(manifest.runtimeOverrides ?? {})) {
    if ((name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) && version !== expectedDshVersion) {
      throw new Error(`EasyWork release overrides ${name} to ${version}; expected ${expectedDshVersion}`)
    }
  }
  if (expectedPackages) {
    const actual = (manifest.packages ?? []).map(item => item.name).sort()
    const expected = [...expectedPackages].sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`EasyWork release package set changed: expected ${expected.join(', ')}, found ${actual.join(', ')}`)
    }
  }
}

export function verifyPackageDshReferences(manifest, expectedDshVersion) {
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if ((name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) && version !== expectedDshVersion) {
        throw new Error(`${manifest.name ?? 'EasyWork package'} references ${name}@${version} in ${field}; expected ${expectedDshVersion}`)
      }
    }
  }
}

/** Export maps include conditional targets and locale patterns, not only literal files. */
export function verifyBuiltPackageExports(pkg, directory) {
  function verify(target) {
    if (typeof target === 'string') {
      const present = target.includes('*') ? globSync(target, { cwd: directory }).length > 0 : existsSync(join(directory, target))
      if (!present) throw new Error(`Missing built export ${target} in ${pkg.name}`)
    } else if (target && typeof target === 'object') {
      for (const value of Object.values(target)) verify(value)
    }
  }
  verify(pkg.exports)
}
