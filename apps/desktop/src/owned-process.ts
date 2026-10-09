/** Stop only the process tree created by this carrier. A parent exit is not a tree exit. */
import { spawn, type ChildProcess } from 'node:child_process'

const cleaned = new WeakMap<ChildProcess, Promise<void>>()
const windowsJobs = new WeakSet<ChildProcess>()
/** Only mark children launched with the mandatory pre-import Job bootstrap. */
export function markWindowsJobProcess(child: ChildProcess): void {
  if (process.platform === 'win32') windowsJobs.add(child)
}
export function cleanOwnedProcessTree(child: ChildProcess): Promise<void> {
  const existing = cleaned.get(child)
  if (existing) return existing
  const pid = child.pid
  let result: Promise<void>
  if (!pid) result = Promise.resolve()
  else if (process.platform !== 'win32') {
    // Run immediately when the parent exits, while its group still belongs to its descendants.
    try { process.kill(-pid, 'SIGKILL') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    result = Promise.resolve()
  } else if (windowsJobs.has(child)) {
    // The root owns the sole KILL_ON_JOB_CLOSE handle. Its exit also ends detached
    // descendants. Never taskkill an exited/reused PID or cache a not-found error.
    result = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { child.removeListener('exit', exited); reject(new Error('Windows 本机进程尚未停止')) }, 12000)
      function exited(): void { clearTimeout(timer); resolve() }
      child.once('exit', exited)
      try { child.kill('SIGKILL') } catch (error) { clearTimeout(timer); child.removeListener('exit', exited); reject(error) }
    })
  } else {
    result = new Promise<void>((resolve, reject) => {
      const task = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      task.once('error', () => reject(new Error('Windows 本机进程树未能停止')))
      task.once('exit', code => code === 0 ? resolve() : reject(new Error('Windows 本机进程树清理未确认')))
    })
  }
  cleaned.set(child, result)
  return result
}

export async function stopOwnedProcess(child: ChildProcess): Promise<void> {
  if (process.platform === 'win32') { await cleanOwnedProcessTree(child); return }
  if (child.exitCode !== null || child.signalCode !== null) { await cleanOwnedProcessTree(child); return }
  await new Promise<void>((resolve, reject) => {
    // Official DSH exits after its own five-second shutdown window. Leave its exit finalizer time to run.
    const force = setTimeout(() => { void cleanOwnedProcessTree(child).catch(reject) }, 8000)
    const timeout = setTimeout(() => { clearTimeout(force); reject(new Error('本机进程尚未停止')) }, 12000)
    child.once('exit', () => {
      clearTimeout(force); clearTimeout(timeout)
      // Do not cancel descendant cleanup just because the parent acknowledged SIGTERM.
      void cleanOwnedProcessTree(child).then(resolve, reject)
    })
    if (child.pid) {
      try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
    } else child.kill('SIGTERM')
  })
}
