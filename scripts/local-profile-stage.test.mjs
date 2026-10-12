import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { createLocalProfileStage } from './local-profile-stage.mjs'

test('cleanup removes only this build stage and preserves existing output directories', t => {
  const root = mkdtempSync(join(tmpdir(), 'easywork-profile-stage-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const existing = join(root, 'existing-user-output.txt')
  writeFileSync(existing, 'keep')
  const stage = createLocalProfileStage(root)
  assert.equal(existsSync(stage.releaseDirectory), false, 'Profile packer requires a fresh archive directory')
  mkdirSync(stage.releaseDirectory)
  writeFileSync(join(stage.releaseDirectory, 'package.tgz'), 'small fixture')
  stage.cleanup()
  assert.equal(existsSync(dirname(stage.releaseDirectory)), false)
  assert.equal(readFileSync(existing, 'utf8'), 'keep')
})
