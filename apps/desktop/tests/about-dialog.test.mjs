import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { aboutContent, bundledRuntimeVersion } from '../src/about-dialog.ts'

const info = { version: '2.0.6-alpha.19', runtime: '0.2.1-rc.2', electron: '38.0.0', chromium: '140.0.0.0', node: '22.19.0', system: 'Windows 10.0.26200 x64' }

test('about content shows product version and runtime details in the UI language', () => {
  const zh = aboutContent('zh-CN', info)
  assert.equal(zh.title, '关于 EasyWork')
  assert.equal(zh.message, 'EasyWork 2.0.6-alpha.19')
  assert.match(zh.detail, /^版本：2\.0\.6-alpha\.19$/mu)
  assert.match(zh.detail, /^DSH 运行时：0\.2\.1-rc\.2$/mu)
  assert.deepEqual(zh.buttons, ['确定', '复制信息'])
  const en = aboutContent('en-US', { ...info, runtime: undefined })
  assert.equal(en.title, 'About EasyWork')
  assert.match(en.detail, /^DSH runtime: Unavailable$/mu)
  assert.match(en.detail, /^System: Windows 10\.0\.26200 x64$/mu)
})

test('bundled runtime version is read from the Profile and tolerates a missing package', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'easywork-about-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  assert.equal(bundledRuntimeVersion(directory), undefined)
  await mkdir(join(directory, 'node_modules', '@deepseek-ai', 'dsh'), { recursive: true })
  await writeFile(join(directory, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), JSON.stringify({ version: '0.2.1-rc.2' }))
  assert.equal(bundledRuntimeVersion(directory), '0.2.1-rc.2')
})
