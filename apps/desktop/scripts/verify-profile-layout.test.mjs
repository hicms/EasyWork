import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { verifyInstalledDshVersions } from './verify-profile-release.mjs'
import { verifyReleaseProfileLayout } from './verify-profile-layout.mjs'

const version = '0.2.0-rc.2'
function fixture(t) {
  const profile = mkdtempSync(join(tmpdir(), 'easywork-layout-test-'))
  t.after(() => rmSync(profile, { recursive: true, force: true }))
  mkdirSync(join(profile, 'node_modules'), { recursive: true })
  writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'nodeLinker: hoisted\n')
  writeFileSync(join(profile, 'node_modules/.modules.yaml'), JSON.stringify({ nodeLinker: 'hoisted' }))
  function install(name, installedVersion = version, parent = profile) {
    const directory = join(parent, 'node_modules', name)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name, version: installedVersion }))
    return directory
  }
  install('@deepseek-ai/dsh')
  return { profile, install }
}

test('nested hoisted official packages cannot hide a different DSH version', t => {
  const { profile, install } = fixture(t)
  const plugin = install('example-plugin', '1.0.0')
  install('@deepseek-ai/dsh-scope', version, plugin)
  mkdirSync(join(profile, 'node_modules/.pnpm'))
  writeFileSync(join(profile, 'node_modules/.pnpm/lock.yaml'), 'lockfileVersion: 9.0\n')
  assert.equal(verifyInstalledDshVersions(profile, version), 2)
  assert.equal(verifyReleaseProfileLayout(profile), 3)
  install('@deepseek-ai/dsh-scope', '0.1.0', plugin)
  assert.throws(() => verifyInstalledDshVersions(profile, version), /Installed @deepseek-ai\/dsh-scope is 0\.1\.0/u)
})

test('changing policy alone cannot disguise an isolated installation', t => {
  const { profile } = fixture(t)
  writeFileSync(join(profile, 'node_modules/.modules.yaml'), 'nodeLinker: isolated\n')
  assert.throws(() => verifyReleaseProfileLayout(profile), /must be installed with nodeLinker: hoisted/u)
})

test('release gate rejects nested linked packages before archive expansion', t => {
  const { profile, install } = fixture(t)
  const plugin = install('example-plugin', '1.0.0')
  mkdirSync(join(plugin, 'node_modules'))
  symlinkSync(join(profile, 'node_modules/@deepseek-ai/dsh'), join(plugin, 'node_modules/dsh-linked'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => verifyReleaseProfileLayout(profile), /package directory is linked/u)
})

test('release gate rejects a retained virtual store', t => {
  const { profile } = fixture(t)
  mkdirSync(join(profile, 'node_modules/.pnpm/example@1.0.0/node_modules'), { recursive: true })
  assert.throws(() => verifyReleaseProfileLayout(profile), /virtual package store/u)
})

test('linked node_modules cycles cannot evade the release gate', t => {
  const { profile, install } = fixture(t)
  const plugin = install('example-plugin', '1.0.0')
  symlinkSync(join(profile, 'node_modules'), join(plugin, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal(verifyInstalledDshVersions(profile, version), 1)
  assert.throws(() => verifyReleaseProfileLayout(profile), /package directory is linked/u)
})
