/** Build-time observer for the files read by a real, isolated official Host startup. */
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const profile = resolve(process.env.EASYWORK_STARTUP_FILES_PROFILE)
const original = fs.readFileSync
const files = new Map()
let recording = true
fs.readFileSync = function (file, ...args) {
  const value = original.call(this, file, ...args)
  if (!recording || typeof file === 'number') return value
  const path = relative(profile, file instanceof URL ? fileURLToPath(file) : String(file)).replaceAll('\\', '/')
  if (!isAbsolute(path) && !path.startsWith('../') && (path.startsWith('node_modules/')
    || ['package.json', 'profile-installation.json', 'cordis.yml', 'cordis.patch.yml'].includes(path))) {
    // This observer only runs with the default UTF-8/Buffer reads made by the packaged Host.
    files.set(path, { path, bytes: Buffer.byteLength(value) })
  }
  return value
}
syncBuiltinESMExports()
globalThis[Symbol.for('easywork.startup.files')] = () => {
  recording = false
  fs.readFileSync = original
  syncBuiltinESMExports()
  const manifest = { version: 1,
    releaseDigest: createHash('sha256').update(original(join(profile, '.easywork-desktop-release.json'))).digest('hex'),
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)) }
  fs.writeFileSync(join(profile, '.easywork-startup-files.json'), JSON.stringify(manifest) + '\n')
  files.clear()
  delete globalThis[Symbol.for('easywork.startup.files')]
}
