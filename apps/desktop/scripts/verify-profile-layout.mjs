import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { load } from 'js-yaml'
import { installedPackageDirectories } from './verify-profile-release.mjs'

/** Windows installer archives expand package links into repeated payloads. */
export function verifyReleaseProfileLayout(profile) {
  const policy = load(readFileSync(join(profile, 'pnpm-workspace.yaml'), 'utf8'))
  const modules = join(profile, 'node_modules')
  const installed = load(readFileSync(join(modules, '.modules.yaml'), 'utf8'))
  if (policy?.nodeLinker !== 'hoisted' || installed?.nodeLinker !== 'hoisted') {
    throw new Error('Desktop release Profile must be installed with nodeLinker: hoisted')
  }
  const hasVirtualPackages = directory => {
    const store = join(directory, '.pnpm')
    return existsSync(store) && (lstatSync(store).isSymbolicLink() || readdirSync(store, { withFileTypes: true }).some(entry => entry.isDirectory() || entry.isSymbolicLink()))
  }
  if (lstatSync(modules).isSymbolicLink() || hasVirtualPackages(modules)) {
    throw new Error('Desktop release Profile contains a linked or virtual package store')
  }
  let count = 0
  const checked = new Set()
  for (const directory of installedPackageDirectories(profile)) {
    const nested = join(directory, 'node_modules')
    if (existsSync(nested) && (lstatSync(nested).isSymbolicLink() || hasVirtualPackages(nested))) {
      throw new Error('Desktop release package directory is linked or contains a virtual package store: ' + nested)
    }
    let path = directory
    while (!checked.has(path)) {
      checked.add(path)
      if (lstatSync(path).isSymbolicLink()) throw new Error('Desktop release package directory is linked: ' + path)
      if (basename(path) === 'node_modules') {
        if (hasVirtualPackages(path)) throw new Error('Desktop release Profile contains a virtual package store: ' + path)
        break
      }
      path = dirname(path)
    }
    count++
  }
  if (!count) throw new Error('Desktop release Profile has no installed packages')
  return count
}
