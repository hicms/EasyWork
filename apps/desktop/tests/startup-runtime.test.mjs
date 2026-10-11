import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { startStartupTrace } from '../src/startup-trace.mjs'
import { archivedRuntimeProfile, runtimeProfileDirectory, packagedHostExecutable } from '../src/runtime-layout.ts'
import { createPackageWithOptions, extractFile, statFile } from '@electron/asar'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'easywork-startup-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root }
}

test('archive preserves published bytes, exposes native resources and ships one Profile', async t => {
  const { root } = await fixture(t)
  const source = join(root, 'source'), profile = join(source, 'profiles', 'easywork')
  const runtime = join(root, 'resources', 'easywork-runtime'), archive = join(root, 'resources', 'app.asar')
  await mkdir(runtime, { recursive: true })
  const files = {
    'package.json': '{"name":"easywork-test-profile"}',
    'profile-installation.json': '{}',
    'node_modules/@deepseek-ai/dsh/lib/profile-boot.js': 'export const official = true',
    'node_modules/native/addon.node': 'native bytes',
    'node_modules/native/helper.exe': 'executable bytes',
    'node_modules/@deepseek-ai/libreoffice-kit-win32-x64/share/config.json': '{"nativeResource":true}',
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(profile, path, '..'), { recursive: true })
    await writeFile(join(profile, path), content)
  }
  const config = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  await createPackageWithOptions(source, archive, { unpack: '{' + config.build.asarUnpack.map(pattern => '**/' + pattern).join(',') + '}' })
  assert.equal(runtimeProfileDirectory(runtime), join(archive, 'profiles', 'easywork'))
  assert.equal(archivedRuntimeProfile(runtimeProfileDirectory(runtime)), true)
  for (const [path, content] of Object.entries(files)) assert.equal(extractFile(archive, join('profiles/easywork', path)).toString(), content)
  for (const path of Object.keys(files).slice(3)) {
    assert.equal(statFile(archive, join('profiles/easywork', path)).unpacked, true, path)
    assert.equal(await readFile(join(archive + '.unpacked', 'profiles/easywork', path), 'utf8'), files[path])
  }
  assert.notEqual(statFile(archive, normalize('profiles/easywork/node_modules/@deepseek-ai/dsh/lib/profile-boot.js')).unpacked, true)
  await mkdir(join(runtime, 'profiles', 'easywork'), { recursive: true })
  assert.throws(() => runtimeProfileDirectory(runtime), /both archived and loose/)
  assert.equal(packagedHostExecutable(join(root, 'resources/easywork-runtime'), 'win32'), join(root, 'EasyWork.exe'))
  assert.equal(packagedHostExecutable(join(root, 'resources/easywork-runtime'), 'linux'), join(root, config.build.executableName))
  assert.equal(packagedHostExecutable(join(root, 'Contents/Resources/easywork-runtime'), 'darwin'), join(root, 'Contents/MacOS/EasyWork'))
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
