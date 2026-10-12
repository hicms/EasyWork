import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { packageWindowsArtifact } from '../scripts/package-win.ts'
import { verifyWindowsPortable } from '../scripts/verify-win-portable.ts'
import { DSH_VERSION } from '../scripts/runtime-version.mjs'

test('portable packages a single EXE with automatic publishing disabled and signing secrets removed', () => {
  const calls = []
  packageWindowsArtifact({
    env: { CSC_LINK: 'private-signing-key', WIN_CSC_KEY_PASSWORD: 'secret', DSH_PACKAGE_CHECK_ALREADY_RAN: '1' },
    platform: 'win32', arch: 'x64', nodeVersion: '25.0.0',
    workspaceRoot: 'workspace', desktopRoot: 'desktop', commandShell: 'cmd.exe',
    builderCli: 'builder-cli', verifier: 'portable-verifier', nodeExecutable: 'node',
    run: (command, args, cwd, env) => calls.push({ command, args, cwd, env }), log: () => {},
  }, 'portable', 'portable executable')
  assert.deepEqual(calls[0].args.slice(0, 6), ['builder-cli', '--win', 'portable', '--x64', '--publish', 'never'])
  assert.equal(calls[0].env.CSC_IDENTITY_AUTO_DISCOVERY, 'false')
  for (const call of calls) {
    assert.equal(call.env.CSC_LINK, undefined)
    assert.equal(call.env.WIN_CSC_KEY_PASSWORD, undefined)
  }
  assert.deepEqual(calls[1].args, ['portable-verifier'])
})

test('portable verification requires the single EXE and verifies bundled runtime metadata', t => {
  const desktopRoot = mkdtempSync(join(tmpdir(), 'easywork-portable-test-'))
  t.after(() => rmSync(desktopRoot, { recursive: true, force: true }))
  const options = { desktopRoot, version: 'test' }
  const artifact = join(desktopRoot, 'dist/EasyWork-test-x64-Portable.exe')
  const runtime = join(desktopRoot, 'dist/win-unpacked/resources/easywork-runtime/primary-runtime')
  const pe = Buffer.alloc(72)
  pe.write('MZ')
  pe.writeUInt32LE(64, 0x3c)
  pe.write('PE\0\0', 64)
  const write = (path, data) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, data)
  }
  write(join(desktopRoot, 'dist/EasyWork-test-x64-Portable.zip'), 'old archive')
  assert.throws(() => verifyWindowsPortable(options), /ENOENT/u)
  write(artifact, 'invalid exe')
  assert.throws(() => verifyWindowsPortable(options), /regular file/u)
  for (const path of [artifact, join(desktopRoot, 'dist/win-unpacked/EasyWork.exe'),
    join(runtime, 'dependencies/python/python.exe'), join(runtime, 'dependencies/node/bin/node.exe')]) write(path, pe)
  const metadata = { desktopVersion: DSH_VERSION, platform: 'win32', arch: 'x64', python: '3.12.14', node: '24.21.0' }
  write(join(runtime, 'runtime.json'), JSON.stringify(metadata))
  assert.equal(verifyWindowsPortable(options), artifact)
  write(join(runtime, 'runtime.json'), JSON.stringify({ ...metadata, desktopVersion: 'other' }))
  assert.throws(() => verifyWindowsPortable(options), /mismatched bundled primary runtime/u)
})
