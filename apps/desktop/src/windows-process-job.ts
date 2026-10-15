/** Contain the official Node runtime before it can launch any tools. */
import { realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export function windowsJobArguments(source: string, home: string): string[] {
  if (process.platform !== 'win32') return []
  if (process.arch !== 'x64') throw new Error('Windows 本机进程管理需要 x64 运行环境')
  // Resolve the public bindings from the one locked Profile, never from the carrier.
  const cli = createRequire(realpathSync(join(source, 'node_modules/@deepseek-ai/dsh/lib/bin.js')))
  const base = createRequire(cli.resolve('@deepseek-ai/dsh-base'))
  const subprocess = createRequire(base.resolve('@deepseek-ai/dsh-subprocess-local'))
  const bindings = pathToFileURL(subprocess.resolve('@deepseek-ai/dsh-win32-process')).href
  const bootstrap = join(home, '.easywork-windows-job.mjs')
  writeFileSync(bootstrap, `import { extendWin32ProcessBindings, isNullPtr, throwLastError } from ${JSON.stringify(bindings)};
const api = extendWin32ProcessBindings(({ kernel32, bind }) => ({ current: bind(kernel32, 'GetCurrentProcess', 'void *', []) }));
const job = api.createJobObjectW(null, null);
if (isNullPtr(job)) throwLastError(api, 'CreateJobObjectW');
// x64 JOBOBJECT_EXTENDED_LIMIT_INFORMATION, with KILL_ON_JOB_CLOSE and no breakaway.
const limits = Buffer.alloc(144);
limits.writeUInt32LE(0x2000, 16);
if (!api.setInformationJobObject(job, 9, limits, limits.length)) throwLastError(api, 'SetInformationJobObject');
if (!api.assignProcessToJobObject(job, api.current())) throwLastError(api, 'AssignProcessToJobObject');
// Keep the sole handle open until Node exits. Windows then terminates every descendant.
// Updating requires the children to leave naturally BEFORE closing this handle.
globalThis[Symbol.for('easywork.waitForOwnedProcesses')] = async () => {
  // Official disposal can finish before its native helpers release their Jobs.
  // Wait for that finite cleanup without terminating them or accepting a live child.
  const deadline = Date.now() + 8000;
  for (;;) {
    if (globalThis[Symbol.for('easywork.ownedProcessShutdownFailed')]) throw new Error('Owned process shutdown failed; update installation refused');
    const accounting = Buffer.alloc(48);
    if (!api.queryInformationJobObject(job, 1, accounting, accounting.length, null)) throwLastError(api, 'QueryInformationJobObject');
    if (accounting.readUInt32LE(40) === 1) return;
    if (Date.now() >= deadline) {
      let detail = 'process list unavailable';
      for (let capacity = 64; capacity <= 65536; capacity *= 2) {
        const list = Buffer.alloc(8 + capacity * 8);
        if (!api.queryInformationJobObject(job, 3, list, list.length, null)) {
          if (api.getLastError() === 234) continue;
          break;
        }
        const assigned = list.readUInt32LE(0), count = list.readUInt32LE(4);
        if (assigned > count || count > capacity) continue;
        detail = 'PIDs ' + Array.from({ length: count }, (_, index) => String(list.readBigUInt64LE(8 + index * 8))).join(',');
        break;
      }
      throw new Error('Owned processes are still running; update installation refused (' + detail + ')');
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};
`, { mode: 0o600 })
  return ['--import', pathToFileURL(bootstrap).href]
}
