import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { startStartupTrace } from '../src/startup-trace.mjs'
import { archivedRuntimeProfile, runtimeProfileDirectory, packagedHostExecutable } from '../src/runtime-layout.ts'
import { extractFile, statFile } from '@electron/asar'
import { AsarPackager } from 'app-builder-lib/out/asar/asarUtil.js'
import { FileMatcher } from 'app-builder-lib/out/fileMatcher.js'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'easywork-startup-test-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root }
}

test('archive preserves published bytes, exposes native resources and ships one Profile', async t => {
  const { root } = await fixture(t)
  const config = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const source = join(root, 'source')
  const profileMapping = config.build.files.find(entry => entry.to === 'profiles/easywork')
  const modulesMapping = config.build.files.find(entry => entry.to === 'profiles/easywork/node_modules')
  const profile = join(source, profileMapping.from)
  const runtime = join(root, 'resources', 'easywork-runtime'), archive = join(root, 'resources', 'app.asar')
  await mkdir(runtime, { recursive: true })
  const files = {
    'package.json': '{"name":"easywork-test-profile"}',
    'profile-installation.json': '{}',
    'node_modules/@deepseek-ai/dsh/lib/profile-boot.js': 'export const official = true',
    'node_modules/native/addon.node': 'native bytes',
    'node_modules/native/helper.exe': 'executable bytes',
    'node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64.node': 'image addon bytes',
    'node_modules/@img/sharp-win32-x64/lib/libvips-42.dll': 'image library bytes',
    'node_modules/@deepseek-ai/libreoffice-kit-win32-x64/share/config.json': '{"nativeResource":true}',
  }
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(profile, path, '..'), { recursive: true })
    await writeFile(join(profile, path), content)
  }
  // Exercise the builder's source-path matching and the real Profile relocation.
  // A direct asar fixture rooted at the destination hides broken unpack globs.
  const destination = join(root, 'app')
  const fileSets = [{ src: source, destination, files: [], metadata: new Map() }]
  for (const mapping of [profileMapping, modulesMapping]) {
    const matcher = new FileMatcher(join(source, mapping.from), join(destination, mapping.to), value => value, mapping.filter)
    const filter = matcher.createFilter()
    const metadata = new Map()
    for (const name of Object.keys(files)) {
      const file = join(profile, name), info = await stat(file)
      if (file.startsWith(matcher.from + sep)) {
        if (filter(file, info)) metadata.set(file, info)
      }
    }
    fileSets.push({ src: matcher.from, destination: matcher.to, files: [...metadata.keys()], metadata })
  }
  const unpackPattern = new FileMatcher(source, destination, value => value, config.build.asarUnpack).createFilter()
  await new AsarPackager({ info: { getWorkspaceRoot: async () => source } }, {
    defaultDestination: destination, resourcePath: join(root, 'resources'), options: config.build.asar, unpackPattern,
  }).pack(fileSets)
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
