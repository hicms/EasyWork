import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWorkflowArgs, parseOptions, releaseInputs } from './release-acceptance.mjs'

test('unsigned release accepts only alpha versions and sends the committed source', () => {
  const commit = 'a'.repeat(40)
  assert.deepEqual(releaseInputs({ commit, version: '2.0.6-alpha.17' }), {
    source_commit: commit, version: '2.0.6-alpha.17',
  })
  assert.deepEqual(buildWorkflowArgs({ commit, version: '2.0.6-alpha.17' }), [
    'workflow', 'run', 'release-acceptance.yml', '--repo', 'hicms/EasyWork', '--ref', 'main',
    '-f', `source_commit=${commit}`, '-f', 'version=2.0.6-alpha.17',
  ])
  assert.throws(() => releaseInputs({ commit, version: '2.0.6' }), /alpha version/u)
})

test('the one-command entry point defaults to waiting and rejects unknown flags', () => {
  assert.deepEqual(parseOptions([]), { dryRun: false, wait: true })
  assert.deepEqual(parseOptions(['--no-wait']), { dryRun: false, wait: false })
  assert.throws(() => parseOptions(['--unknown']), /Unsupported option/u)
  assert.throws(() => parseOptions(['--dry-run', '--dry-run']), /Duplicate option/u)
})
