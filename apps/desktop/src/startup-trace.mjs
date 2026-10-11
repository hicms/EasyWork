/** Opt-in startup observation. Preserve the official Loader's return values and errors. */
import fs from 'node:fs'
import { createRequire, syncBuiltinESMExports } from 'node:module'
import { isAbsolute, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Session } from 'node:inspector'

export async function startStartupTrace(profile, directory) {
  const started = performance.now(), rows = [], reads = new Map(), restore = []
  const now = () => Math.round((performance.now() - started) * 100) / 100
  let active = true
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
  const filename = join(directory, `host-startup-${Date.now()}-${process.pid}`)
  const write = fs.writeFileSync, read = fs.readFileSync
  const snapshot = complete => {
    try { write(filename + '.json', JSON.stringify({ complete, elapsedMs: now(), rows, reads: [...reads.values()] }), { mode: 0o600 }) } catch { /* Optional diagnostics. */ }
  }
  fs.readFileSync = function (file, ...args) {
    if (!active) return read.call(this, file, ...args)
    const start = now()
    try { return read.call(this, file, ...args) }
    finally {
      if (typeof file !== 'number') {
        const path = relative(profile, file instanceof URL ? fileURLToPath(file) : String(file)).replaceAll('\\', '/')
        if (!isAbsolute(path) && !path.startsWith('../') && reads.size < 8192) {
          const item = reads.get(path) ?? { path, count: 0, durationMs: 0 }
          item.count++; item.durationMs += now() - start; reads.set(path, item)
        }
      }
    }
  }
  restore.push(() => { fs.readFileSync = read; syncBuiltinESMExports() })
  syncBuiltinESMExports()
  const inspector = new Session()
  const post = (method, params = {}) => new Promise((resolve, reject) => inspector.post(method, params, (error, value) => error ? reject(error) : resolve(value)))
  let timer
  const stop = () => {
    active = false
    clearInterval(timer)
    for (const release of restore.reverse()) release()
  }
  try {
    inspector.connect()
    await post('Profiler.enable')
    await post('Profiler.setSamplingInterval', { interval: 2000 })
    await post('Profiler.start')
    const require = createRequire(join(profile, 'package.json'))
    const { EntryTree } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis-plugin-loader')).href)
    const { Fiber } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href)
    const observe = (prototype, key, kind, identify) => {
      const original = prototype[key]
      prototype[key] = function (...args) {
        if (!active || rows.length >= 8192) return original.apply(this, args)
        const candidate = identify.call(this, args)
        const name = typeof candidate === 'string' && /^(?:@?[a-zA-Z0-9_./:-]+)$/u.test(candidate) ? candidate.slice(0, 200) : '(plugin)'
        const row = { kind, name, startMs: now() }
        rows.push(row)
        const finish = failed => { row.durationMs = now() - row.startMs; row.failed = failed }
        try {
          const value = original.apply(this, args)
          row.syncMs = now() - row.startMs
          if (value?.then) value.then(() => finish(false), () => finish(true))
          else finish(false)
          return value
        } catch (error) { finish(true); throw error }
      }
      restore.push(() => { prototype[key] = original })
    }
    observe(EntryTree.prototype, 'import', 'import', args => args[0])
    observe(Fiber.prototype, '_execute', 'activate', function () { return this.entry?.options?.name ?? this.runtime?.callback?.name })
    timer = setInterval(() => snapshot(false), 5000).unref()
    return async () => {
      stop()
      try {
        const { profile: cpu } = await post('Profiler.stop')
        write(filename + '.cpuprofile', JSON.stringify(cpu), { mode: 0o600 })
        snapshot(true)
      } finally { inspector.disconnect() }
    }
  } catch {
    stop()
    inspector.disconnect()
    return () => {}
  }
}
