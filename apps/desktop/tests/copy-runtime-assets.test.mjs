import assert from 'node:assert/strict'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyRuntimeAssets } from '../scripts/copy-runtime-assets.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'easywork-runtime-copy-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const source = join(root, 'source'), destination = join(root, 'destination')
  mkdirSync(join(source, 'bin'), { recursive: true })
  mkdirSync(join(source, 'empty'))
  writeFileSync(join(source, 'runtime.json'), '{"version":"locked"}')
  writeFileSync(join(source, 'bin/node'), Buffer.alloc(200_000, 42), { mode: 0o755 })
  writeFileSync(join(source, 'empty-file'), '')
  const receipt = join(root, 'receipt.json')
  return { root, source, destination, receipt, run: () => copyRuntimeAssets(source, destination, receipt) }
}

test('initial preparation copies all assets; identical bytes cause no repeated writes', t => {
  const f = fixture(t)
  const first = f.run()
  assert.equal(first.copiedFiles, 3)
  assert.equal(first.copiedBytes, 200_020)
  assert.equal(existsSync(join(f.destination, 'empty')), true)
  const sentinel = new Date('2001-01-01T00:00:00Z')
  utimesSync(join(f.destination, 'bin/node'), sentinel, sentinel)
  const second = f.run()
  assert.deepEqual(second, { copiedFiles: 0, copiedBytes: 0, unchangedFiles: 3, copiedLinks: 0, reusedChecks: 2 })
  assert.equal(lstatSync(join(f.destination, 'bin/node')).mtimeMs, sentinel.getTime())
  assert.equal(f.run().reusedChecks, 3)
});

test('same-size corruption with unchanged timestamps is repaired', t => {
  const f = fixture(t)
  f.run()
  const path = join(f.destination, 'bin/node'), before = lstatSync(path)
  const beforeChange = lstatSync(path, { bigint: true }).ctimeNs
  const corrupt = readFileSync(path)
  corrupt[150_000] = 99
  writeFileSync(path, corrupt)
  utimesSync(path, before.atime, before.mtime)
  assert.notEqual(lstatSync(path, { bigint: true }).ctimeNs, beforeChange)
  assert.equal(f.run().copiedFiles, 1)
  assert.deepEqual(readFileSync(path), readFileSync(join(f.source, 'bin/node')))
  assert.equal(f.run().copiedFiles, 0)
});

test('source changes invalidate a cached check even when size and mtime are restored', t => {
  const f = fixture(t)
  f.run()
  const path = join(f.source, 'bin/node'), before = lstatSync(path)
  writeFileSync(path, Buffer.alloc(200_000, 51))
  utimesSync(path, before.atime, before.mtime)
  assert.equal(f.run().copiedFiles, 1)
  assert.deepEqual(readFileSync(join(f.destination, 'bin/node')), readFileSync(path))
});

test('replacement files cannot reuse the old file identity', t => {
  const f = fixture(t)
  f.run()
  const path = join(f.destination, 'bin/node')
  rmSync(path)
  writeFileSync(path, Buffer.alloc(200_000, 55))
  assert.equal(f.run().copiedFiles, 1)
  assert.deepEqual(readFileSync(path), readFileSync(join(f.source, 'bin/node')))
});

test('missing or invalid receipts recheck content and rebuild the private record', t => {
  const f = fixture(t)
  f.run()
  for (const record of [undefined, '{broken', JSON.stringify({ version: 0, files: {} })]) {
    if (record === undefined) rmSync(f.receipt)
    else writeFileSync(f.receipt, record)
    const result = f.run()
    assert.equal(result.reusedChecks, 0)
    assert.equal(result.copiedFiles, 0)
    assert.equal(JSON.parse(readFileSync(f.receipt)).version, 1)
  }
});

test('failed preparation does not replace the previous successful receipt', t => {
  const f = fixture(t)
  f.run()
  const record = readFileSync(f.receipt)
  // A destination parent that is a regular file cannot contain a copied tree.
  const blocked = join(f.root, 'blocked')
  writeFileSync(blocked, 'file')
  assert.throws(() => copyRuntimeAssets(f.source, join(blocked, 'child'), f.receipt))
  assert.deepEqual(readFileSync(f.receipt), record)
});

test('missing files and changed release bytes are copied while extra build files remain', t => {
  const f = fixture(t)
  f.run()
  rmSync(join(f.destination, 'empty-file'))
  writeFileSync(join(f.source, 'runtime.json'), '{"version":"next"}')
  writeFileSync(join(f.destination, 'extra'), 'retain existing merge semantics')
  assert.equal(f.run().copiedFiles, 2)
  assert.equal(readFileSync(join(f.destination, 'runtime.json'), 'utf8'), '{"version":"next"}')
  assert.equal(readFileSync(join(f.destination, 'extra'), 'utf8'), 'retain existing merge semantics')
});

test('repairing a destination directory link cannot modify its external target', t => {
  const f = fixture(t), outside = join(f.root, 'outside')
  mkdirSync(f.destination)
  mkdirSync(outside)
  writeFileSync(join(outside, 'node'), 'keep outside bytes')
  symlinkSync(outside, join(f.destination, 'bin'), process.platform === 'win32' ? 'junction' : 'dir')
  f.run()
  assert.equal(lstatSync(join(f.destination, 'bin')).isSymbolicLink(), false)
  assert.equal(readFileSync(join(outside, 'node'), 'utf8'), 'keep outside bytes')
  assert.deepEqual(readFileSync(join(f.destination, 'bin/node')), readFileSync(join(f.source, 'bin/node')))
});

test('file/directory collisions are repaired inside the destination only', t => {
  const f = fixture(t)
  mkdirSync(join(f.destination, 'runtime.json'), { recursive: true })
  writeFileSync(join(f.destination, 'bin'), 'wrong kind')
  f.run()
  assert.equal(lstatSync(join(f.destination, 'runtime.json')).isFile(), true)
  assert.equal(lstatSync(join(f.destination, 'bin')).isDirectory(), true)
});

test('relative symbolic links stay links and are reused', t => {
  const f = fixture(t)
  try { symlinkSync('bin/node', join(f.source, 'node-link'), 'file') }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('File symlinks require Windows Developer Mode'); return }; throw error }
  assert.equal(f.run().copiedLinks, 1)
  assert.equal(readlinkSync(join(f.destination, 'node-link')), readlinkSync(join(f.source, 'node-link')))
  assert.equal(f.run().copiedLinks, 0)
});

test('Unix executable modes are repaired without rewriting identical contents', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t)
  f.run()
  chmodSync(join(f.destination, 'bin/node'), 0o644)
  assert.equal(f.run().copiedFiles, 0)
  assert.equal(lstatSync(join(f.destination, 'bin/node')).mode & 0o777, 0o755)
});
