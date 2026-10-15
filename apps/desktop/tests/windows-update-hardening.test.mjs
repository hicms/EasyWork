import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runSignatureCommand } from '../src/windows-update-signature.ts'
import { fileURLToPath } from 'node:url'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import childProcess from 'node:child_process'
import { windowsInstallerCommand } from '../src/windows-update-launch.ts'
import { windowsJobArguments } from '../src/windows-process-job.ts'

test('real Windows PowerShell suppresses non-error progress but still rejects errors', { skip: process.platform !== 'win32' }, async () => {
  const output = await runSignatureCommand("Get-Command Get-AuthenticodeSignature | Out-Null; Write-Progress -Activity 'test' -Status 'first use'; Write-Output '{\"Status\":0}'")
  assert.deepEqual(JSON.parse(output), { Status: 0 })
  await assert.rejects(runSignatureCommand("Write-Error 'intentional verifier boundary test'"), /verification failed/u)
})

test('actual Windows command line leaves NSIS /D last and unquoted even with spaces and punctuation', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'easywork-command-line-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const probe = join(directory, 'command line.ps1')
  await writeFile(probe, '[Console]::Write([Environment]::CommandLine)')
  const target = "C:\\Users\\it's` safe\\Local Programs\\EasyWork"
  const executable = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
  const command = windowsInstallerCommand('C:\\cache space\\Setup.exe', target)
  const output = await new Promise((resolve, reject) => {
    const child = childProcess.spawn(executable, ['-NoProfile', '-NonInteractive', '-File', `"${probe}"`, ...command.args], {
      ...command.options, argv0: `"${executable}"`, detached: false, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = '', stderr = ''
    child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
    child.once('error', reject); child.once('close', code => code === 0 && !stderr ? resolve(stdout) : reject(new Error(stderr || `exit ${code}`)))
  })
  assert(output.endsWith(` /S --updated --force-run /D=${target}`), output)
  assert(!output.includes('"/D='), output)
  assert.equal(command.options.env.EASYWORK_UPDATE_INSTALL_DIRECTORY, target)
})

test('installer process predicate ignores other installations and blocks unknown or same-target processes', { skip: process.platform !== 'win32' }, async () => {
  const script = fileURLToPath(new URL('../scripts/installer-process-check.ps1', import.meta.url)).replaceAll("'", "''")
  const result = await runSignatureCommand(`
. '${script}'
$target = 'C:\\Users\\it''s\` safe\\EasyWork\\EasyWork.exe'
$other = @{Name='EasyWork.exe'; ExecutablePath='C:\\Other\\EasyWork.exe'}
$same = @{Name='EasyWork.exe'; ExecutablePath=$target.ToUpperInvariant()}
if (-not (Test-EasyWorkTargetIdle $target @($other))) { throw 'Other installation was blocked' }
if (Test-EasyWorkTargetIdle $target @($same)) { throw 'Target installation was missed' }
$blocked = $false
try { Test-EasyWorkTargetIdle $target @(@{Name='EasyWork.exe';ExecutablePath=$null}) | Out-Null } catch { $blocked = $true }
if (-not $blocked) { throw 'Unknown process ownership was accepted' }
Write-Output 'ok'
`)
  assert.equal(result.trim(), 'ok')
})

test('native Windows Job waits for delayed cleanup and refuses a live child without killing it', { skip: process.platform !== 'win32' }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'easywork-job-drain-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const probe = join(directory, 'probe.mjs')
  await writeFile(probe, `
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const drain = globalThis[Symbol.for('easywork.waitForOwnedProcesses')];
for (const delayed of [true, false]) {
  const child = spawn(process.execPath, ['-e', "process.on('message', value => value === 'finish' ? process.exit(0) : setTimeout(() => process.exit(0), value)); process.send('ready');"], { stdio: ['ignore','ignore','inherit','ipc'], windowsHide: true });
  const closed = once(child, 'close');
  await once(child, 'message');
  let acknowledged = false;
  try {
    const started = Date.now();
    if (delayed) child.send(3000);
    const stopped = drain().then(() => { acknowledged = true; });
    if (delayed) { await stopped; assert.equal(acknowledged, true); assert(Date.now() - started >= 2500, 'Job drain returned before delayed child exited'); }
    else {
      await assert.rejects(stopped, /Owned processes are still running/);
      assert.equal(acknowledged, false); assert.equal(child.exitCode, null); assert.equal(child.signalCode, null);
    }
  } finally { if (child.connected) child.send('finish'); }
  assert.deepEqual(await closed, [0, null]);
  await drain();
}
globalThis[Symbol.for('easywork.ownedProcessShutdownFailed')] = true;
await assert.rejects(drain(), /Owned process shutdown failed/);
console.log('native delayed cleanup, live-child refusal and failed-close latch passed');
`)
  const source = fileURLToPath(new URL('../../web', import.meta.url))
  const output = await new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, [...windowsJobArguments(source, directory), probe], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', bytes => { stdout += bytes }); child.stderr.on('data', bytes => { stderr += bytes })
    child.once('error', reject); child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `exit ${code}`)))
  })
  assert.match(output, /native delayed cleanup, live-child refusal and failed-close latch passed/u)
})
