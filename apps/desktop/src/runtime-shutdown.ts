/** Official application disposal over the carrier's private child channel. */
import type { ChildProcess } from 'node:child_process'
import { stopOwnedProcess } from './owned-process.ts'

type ShutdownResult = 'graceful' | 'forced'
const stops = new WeakMap<ChildProcess, () => Promise<ShutdownResult>>()

export function watchRuntimeShutdown(child: ChildProcess): void {
  let requested = false, acknowledged = false, closed = false
  let code: number | null = null, signal: NodeJS.Signals | null = null
  let pending: Promise<ShutdownResult> | undefined
  let onClose: (() => void) | undefined
  const onMessage = (message: unknown): void => {
    if (requested && message && typeof message === 'object'
      && 'type' in message && message.type === 'workdsh-shutdown-complete') acknowledged = true
  }
  child.on('message', onMessage)
  child.once('close', (exitCode, exitSignal) => {
    closed = true; code = exitCode; signal = exitSignal
    child.removeListener('message', onMessage)
    onClose?.()
  })
  stops.set(child, () => {
    if (pending) return pending
    requested = true
    pending = new Promise<ShutdownResult>((resolve, reject) => {
      let finished = false, forcing = false
      const finish = (result: ShutdownResult): void => {
        if (finished) return
        finished = true; clearTimeout(timer); resolve(result)
      }
      const force = (): void => {
        if (finished || forcing) return
        forcing = true; clearTimeout(timer)
        // No acknowledgement is not proof of disposal, even with exit code zero.
        void stopOwnedProcess(child).then(() => finish('forced'), error => { finished = true; reject(error) })
      }
      const timer = setTimeout(force, 8000)
      onClose = () => { if (!forcing && acknowledged && code === 0 && signal === null) finish('graceful'); else force() }
      if (closed || !child.connected) { force(); return }
      try { child.send({ type: 'workdsh-shutdown' }, error => { if (error) force() }) }
      catch { force() }
    })
    return pending
  })
}

export function stopRuntimeProcess(child: ChildProcess): Promise<ShutdownResult> {
  const stop = stops.get(child)
  return stop ? stop() : stopOwnedProcess(child).then(() => 'forced')
}
