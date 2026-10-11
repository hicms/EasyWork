import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { prefetchStartupFiles, STARTUP_FILES } from '../src/startup-prefetch.mjs'
import { startStartupTrace } from '../src/startup-trace.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'easywork-startup-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const release = '{"version":"test"}'
  await writeFile(join(root, '.easywork-desktop-release.json'), release)
  await mkdir(join(root, 'node_modules', 'test-plugin'), { recursive: true })
  await writeFile(join(root, 'node_modules', 'test-plugin', 'index.js'), 'original')
  const save = files => writeFile(join(root, STARTUP_FILES), JSON.stringify({ version: 1,
    releaseDigest: createHash('sha256').update(release).digest('hex'), files }))
  return { root, save }
}

test('prefetch reads current packaged bytes and never creates or modifies modules', async t => {
  const { root, save } = await fixture(t)
  await save([{ path: 'node_modules/test-plugin/index.js', bytes: 8 }])
  await writeFile(join(root, 'node_modules/test-plugin/index.js'), 'current contents')
  const result = await prefetchStartupFiles(root)
  assert.equal(result.files, 1)
  assert.equal(result.bytes, Buffer.byteLength('current contents'))
  assert.equal(result.failed, 0)
  assert.equal(await readFile(join(root, 'node_modules/test-plugin/index.js'), 'utf8'), 'current contents')
})

test('missing, stale, malformed and escaping hints leave normal startup available', async t => {
  const { root, save } = await fixture(t)
  assert.equal((await prefetchStartupFiles(root)).files, 0)
  for (const path of ['../private.json', '/private.json', 'node_modules/../private.json', 'node_modules/C:/private.json', 'node_modules\\private.json']) {
    await save([{ path, bytes: 1 }])
    assert.equal((await prefetchStartupFiles(root)).files, 0)
  }
  await writeFile(join(root, STARTUP_FILES), 'broken json')
  assert.equal((await prefetchStartupFiles(root)).files, 0)
  await save([{ path: 'node_modules/test-plugin/index.js', bytes: 8 }])
  await writeFile(join(root, '.easywork-desktop-release.json'), 'new release')
  assert.equal((await prefetchStartupFiles(root)).files, 0)
})

test('unavailable optional resources do not fail startup or stop other reads', async t => {
  const { root, save } = await fixture(t)
  await save([{ path: 'node_modules/missing.js', bytes: 1 }, { path: 'node_modules/test-plugin/index.js', bytes: 8 }])
  const result = await prefetchStartupFiles(root)
  assert.equal(result.files, 1)
  assert.equal(result.failed, 1)
  assert.equal(result.timedOut, false)
})

test('optional tracing preserves synchronous returns, promise identity and errors, then restores hooks', async t => {
  const { root } = await fixture(t)
  await writeFile(join(root, 'package.json'), '{"type":"module"}')
  for (const [name, exported, method] of [['cordis', 'Fiber', '_execute'], ['cordis-plugin-loader', 'EntryTree', 'import']]) {
    const directory = join(root, 'node_modules', '@deepseek-ai', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), '{"type":"module","main":"index.js"}')
    await writeFile(join(directory, 'index.js'), `export class ${exported} { ${method}(value) { if (value instanceof Error) throw value; return value } }`)
  }
  const { EntryTree } = await import(pathToFileURL(join(root, 'node_modules/@deepseek-ai/cordis-plugin-loader/index.js')).href)
  const { Fiber } = await import(pathToFileURL(join(root, 'node_modules/@deepseek-ai/cordis/index.js')).href)
  const originalImport = EntryTree.prototype.import, originalExecute = Fiber.prototype._execute, originalRead = fs.readFileSync
  const finish = await startStartupTrace(root, join(root, 'logs'))
  try {
    const tree = new EntryTree(), fiber = new Fiber(), value = {}, error = new Error('expected')
    assert.equal(tree.import(value), value)
    const promise = Promise.resolve(value)
    assert.equal(fiber._execute(promise), promise)
    assert.throws(() => fiber._execute(error), thrown => thrown === error)
    const rejected = Promise.reject(error)
    assert.equal(tree.import(rejected), rejected)
    await assert.rejects(rejected, thrown => thrown === error)
  } finally { await finish() }
  assert.equal(EntryTree.prototype.import, originalImport)
  assert.equal(Fiber.prototype._execute, originalExecute)
  assert.equal(fs.readFileSync, originalRead)
})
