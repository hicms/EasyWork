/** Bounded local startup diagnostics. Runtime output is summarised, never stored as text. */
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'

type Fields = Record<string, string | number | boolean | null | undefined>
const MAX_FILE = 2 * 1024 * 1024
const MAX_QUEUE = 128 * 1024
const QUEUE_RESERVE = 512 // Leave space for the fixed dropped-record summary.
const MAX_LINE = 16 * 1024
const ERROR_CODES = ['ENOENT', 'EACCES', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ERR_MODULE_NOT_FOUND',
  'ERR_CONNECTION_RESET', 'ERR_CONNECTION_REFUSED', 'ERR_ABORTED', 'ERR_FAILED', 'ERR_TIMED_OUT']

function redact(value: string): string {
  if (value.length > MAX_LINE) return '[oversized diagnostic omitted]'
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/([?&](?:token|access_token|api[_-]?key|key|secret|password)=)[^&#\s"']*/giu, '$1[redacted]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=-]+/giu, '[redacted authorization]')
    .replace(/(["']?(?:authorization|proxy-authorization|cookie|set-cookie)["']?\s*[:=]\s*)[^\r\n]*/giu, '$1[redacted]')
    .replace(/(["']?(?:token|access[_-]?token|api[_-]?key|password|secret)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/giu, '$1[redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b/gu, '[redacted key]')
    .slice(0, 2048)
}

export function startupErrorFields(error: unknown): Fields {
  const code = error instanceof Error && 'code' in error ? String(error.code) : ''
  const name = error instanceof Error ? error.name : 'Error'
  return { error: ['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AbortError', 'TimeoutError'].includes(name) ? name : 'Error',
    code: ERROR_CODES.includes(code) ? code : undefined }
}

export class StartupLog {
  readonly file: string
  readonly #started = performance.now()
  readonly #stages = new Map<string, number>()
  readonly #initialized: Promise<void>
  readonly #fatalFile: string
  #queue = ''
  #queuedBytes = 0
  #bytes = 0
  #dropped = 0
  #disabled = false
  #timer: ReturnType<typeof setTimeout> | undefined
  #writing: Promise<void> | undefined

  constructor(userData: string) {
    this.file = join(userData, 'logs', 'startup.log')
    this.#fatalFile = join(userData, 'startup-fatal.log')
    this.#initialized = mkdir(join(userData, 'logs'), { recursive: true, mode: 0o700 }).then(async () => {
      try { this.#bytes = (await stat(this.file)).size }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }).catch(() => { this.#disable() })
  }

  write(event: string, fields: Fields = {}): void {
    if (this.#disabled) return
    const safe = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, typeof value === 'string' ? redact(value) : value]))
    const row = JSON.stringify({ time: new Date().toISOString(), pid: process.pid,
      elapsedMs: Math.round(performance.now() - this.#started), event, ...safe }) + '\n'
    const bytes = Buffer.byteLength(row)
    if (this.#queuedBytes + bytes > MAX_QUEUE - QUEUE_RESERVE) { this.#dropped++; return }
    this.#queue += row
    this.#queuedBytes += bytes
    this.#timer ??= setTimeout(() => { this.#timer = undefined; void this.flush() }, 100).unref()
  }

  stage(name: string): (fields?: Fields) => void {
    const started = performance.now()
    this.#stages.set(name, started)
    this.write(name + '.begin')
    let ended = false
    return (fields = {}) => {
      if (ended) return
      ended = true
      this.#stages.delete(name)
      this.write(name + '.end', { durationMs: Math.round(performance.now() - started), ...fields })
    }
  }

  heartbeat(fields: Fields): void {
    this.write('startup.waiting', { stages: [...this.#stages].map(([name, start]) => `${name}:${Math.round(performance.now() - start)}ms`).join(', '), ...fields })
  }

  output(event: string, line: string): void {
    if (this.#disabled) return
    if (this.#queuedBytes >= MAX_QUEUE - 4096) { this.#dropped++; return }
    if (Buffer.byteLength(line) > MAX_LINE) { this.write(event, { oversized: true }); return }
    this.write(event, { bytes: Buffer.byteLength(line), fingerprint: createHash('sha256').update(line).digest('hex').slice(0, 16),
      codes: ERROR_CODES.filter(code => new RegExp(`\\b${code}\\b`, 'u').test(line)).join(',') })
  }

  /** Hash complete lines for correlation without retaining plugin/user content. */
  capture(stream: Readable, event: string, active: () => boolean): () => void {
    let decoder = new StringDecoder('utf8'), capturing = true
    let stopped = false
    let line = '', oversized = false
    const record = (): void => {
      if (active() && (line || oversized)) {
        if (oversized) this.write(event, { oversized: true })
        else this.output(event, line)
      }
      line = ''; oversized = false
    }
    const consume = (text: string): void => {
      for (const part of text.split(/(?<=\n)/u)) {
        if (!oversized) {
          if (Buffer.byteLength(line) + Buffer.byteLength(part) > MAX_LINE) { line = ''; oversized = true }
          else line += part
        }
        if (part.endsWith('\n')) record()
      }
    }
    stream.on('data', (chunk: Buffer) => {
      if (stopped || this.#disabled || !active()) {
        if (capturing) { decoder = new StringDecoder('utf8'); line = ''; oversized = false; capturing = false }
        return // Keep the pipe drained without decoding runtime output after boot.
      }
      capturing = true
      consume(decoder.write(chunk))
    })
    stream.once('end', () => { if (!stopped && !this.#disabled && active()) { consume(decoder.end()); record() } })
    return () => { stopped = true; decoder = new StringDecoder('utf8'); line = ''; oversized = false; capturing = false }
  }

  flush(): Promise<void> {
    if (this.#timer) { clearTimeout(this.#timer); this.#timer = undefined }
    if (this.#disabled) return Promise.resolve()
    this.#writing ??= this.#drain().catch(() => { this.#disable() }).finally(() => { this.#writing = undefined })
    // A write can arrive after drain returns but before its finalizer clears #writing.
    // Each explicit flush must also await any batch arriving in that microtask gap.
    return this.#writing.then(() => this.#queue && !this.#disabled ? this.flush() : undefined)
  }

  async flushForQuit(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { await Promise.race([this.flush(), new Promise<void>(resolve => { timer = setTimeout(resolve, 2000) })]) }
    finally { if (timer) clearTimeout(timer) }
  }

  /** A fatal process cannot await the normal writer; save only a tiny fixed metadata record. */
  crash(error: unknown): void {
    try {
      writeFileSync(this.#fatalFile, JSON.stringify({ time: new Date().toISOString(), pid: process.pid,
        event: 'app.uncaught', ...startupErrorFields(error) }) + '\n', { mode: 0o600 })
    } catch { /* Preserve the process's normal fatal exception handling. */ }
  }

  async #drain(): Promise<void> {
    await this.#initialized
    while (!this.#disabled && this.#queue) {
      let batch = this.#queue
      const heldBytes = this.#queuedBytes
      this.#queue = ''
      if (this.#dropped) {
        batch += JSON.stringify({ time: new Date().toISOString(), pid: process.pid, event: 'log.queue-limited', dropped: this.#dropped }) + '\n'
        this.#dropped = 0
      }
      const size = Buffer.byteLength(batch)
      if (this.#bytes + size > MAX_FILE) {
        await rm(this.file + '.3', { force: true })
        for (let i = 2; i >= 0; i--) {
          const source = this.file + (i ? '.' + i : '')
          try { await rename(source, this.file + '.' + (i + 1)) }
          catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        }
        this.#bytes = 0
      }
      await appendFile(this.file, batch, { mode: 0o600 })
      this.#bytes += size
      this.#queuedBytes -= heldBytes
    }
  }

  #disable(): void {
    this.#disabled = true
    if (this.#timer) { clearTimeout(this.#timer); this.#timer = undefined }
    this.#queue = ''
    this.#queuedBytes = 0
    process.stderr.write('EasyWork startup diagnostics could not be written.\n')
  }
}
