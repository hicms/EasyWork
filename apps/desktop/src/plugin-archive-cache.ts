import { join } from 'node:path'
import { writeFileSync } from 'node:fs'

/** Delegate to the bundled pnpm after retaining local archives in this account's Home. */
export function cachedPackageManager(home: string, pnpm: string): string {
  const runner = join(home, '.workdsh-package-manager.mjs')
  writeFileSync(runner, String.raw`import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const cache = join(fileURLToPath(new URL('.', import.meta.url)), 'plugin-archives');
const args = process.argv.slice(2);
if (args.includes('add')) {
  for (let i = 0; i < args.length; i++) {
    const spec = args[i];
    if (!/\.(tgz|tar\.gz)$/i.test(spec) || /^(https?:|npm:)/i.test(spec)) continue;
    const source = spec.startsWith('file://') ? fileURLToPath(spec) : resolve(spec.startsWith('file:') ? spec.slice(5) : spec);
    if (!statSync(source).isFile()) throw new Error('Plugin archive is not a file: ' + source);
    const bytes = readFileSync(source);
    const digest = createHash('sha256').update(bytes).digest('hex');
    mkdirSync(cache, { recursive: true, mode: 0o700 });
    const destination = join(cache, digest + '.tgz');
    try { writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (createHash('sha256').update(readFileSync(destination)).digest('hex') !== digest) throw new Error('Plugin archive cache integrity failure');
    args[i] = destination;
  }
}
const child = spawn(process.execPath, [${JSON.stringify(pnpm)}, ...args], { stdio: 'inherit', windowsHide: true });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
`, { mode: 0o600 })
  return runner
}
