/** Packaged checks use Electron's ASAR filesystem, just like the application Host. */
import { spawnSync } from 'node:child_process'
import { archivedRuntimeProfile, packagedHostExecutable, runtimeProfileDirectory } from '../src/runtime-layout.ts'

export function ensureRuntimeAuditProcess(runtime) {
  const profile = runtimeProfileDirectory(runtime)
  if (archivedRuntimeProfile(profile) && !process.versions.electron) {
    const result = spawnSync(packagedHostExecutable(runtime), ['--expose-internals', ...process.argv.slice(1)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: 'inherit', timeout: 120_000,
    })
    if (result.error) throw result.error
    process.exit(result.status ?? 1)
  }
  return profile
}
