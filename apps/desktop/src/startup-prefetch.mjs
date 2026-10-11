/** Warm only packaged startup resources; the official resolver still reads and loads every file. */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

export const STARTUP_FILES = '.easywork-startup-files.json'
const RELEASE = '.easywork-desktop-release.json'

/** @param {string} profile @param {{ budgetMs?: number, concurrency?: number }} [options] */
export async function prefetchStartupFiles(profile, options = {}) {
  const result = { files: 0, bytes: 0, failed: 0, timedOut: false }
  const controller = new AbortController()
  let timer
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => { result.timedOut = true; controller.abort(); resolve() }, options.budgetMs ?? 10_000)
  })
  const work = async () => {
    const read = file => readFile(join(profile, file), { signal: controller.signal })
    let manifest
    try {
      const [index, release] = await Promise.all([read(STARTUP_FILES), read(RELEASE)])
      if (index.length > 2 * 1024 * 1024) return
      manifest = JSON.parse(index.toString('utf8'))
      if (manifest.version !== 1 || manifest.releaseDigest !== createHash('sha256').update(release).digest('hex')
        || !Array.isArray(manifest.files) || manifest.files.length > 8192) return
    } catch { return } // Missing or stale hints must never prevent startup.
    const files = []
    let total = 0
    for (const entry of manifest.files) {
      if (!entry || typeof entry.path !== 'string' || entry.path.length > 1024
        || !/^(?:node_modules\/[^\\:]+|package\.json|profile-installation\.json|cordis(?:\.patch)?\.yml)$/u.test(entry.path)
        || entry.path.split('/').some(part => part === '..' || part === '.' || part === '')
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > 16 * 1024 * 1024) return
      total += entry.bytes
      if (total > 256 * 1024 * 1024) return
      files.push(entry.path)
    }
    let next = 0
    await Promise.all(Array.from({ length: Math.min(files.length, options.concurrency ?? 32) }, async () => {
      while (next < files.length && !controller.signal.aborted) {
        const path = files[next++]
        try {
          const data = await read(path)
          result.files++
          result.bytes += data.length
        } catch { result.failed++ }
      }
    }))
  }
  try { await Promise.race([work(), deadline]) }
  finally { clearTimeout(timer) }
  return { ...result }
}
