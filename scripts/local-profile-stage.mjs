/** Disposable package archives for a local build; the prepared runtime stays in its fixed directory. */
import { lstatSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

export function createLocalProfileStage(buildRoot) {
  const root = resolve(buildRoot)
  mkdirSync(root, { recursive: true })
  const directory = mkdtempSync(join(root, 'easywork-profile-local-'))
  return {
    releaseDirectory: join(directory, 'archives'),
    cleanup() {
      const withinRoot = relative(root, resolve(directory))
      if (!withinRoot || isAbsolute(withinRoot) || withinRoot.startsWith('..') || lstatSync(directory).isSymbolicLink()) {
        throw new Error('Refusing to clean a Profile stage outside its build directory')
      }
      rmSync(directory, { recursive: true, force: true })
    },
  }
}
