import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWorkflowArgs, parseOptions, releaseInputs } from './release-acceptance.mjs'
import { selectBaseline } from './resolve-unsigned-baseline.mjs'

test('release preflight rejects an already published version and selects the newest older baseline', () => {
  const releases = ['2.0.6-alpha.9', '2.0.6-alpha.16'].map(version => ({
    tag_name: `acceptance-v${version}`, draft: false, prerelease: true,
  }))
  releases.push({ tag_name: 'acceptance-v2.0.6-alpha.17', draft: true, prerelease: true })
  assert.equal(selectBaseline(releases, '2.0.6-alpha.18'), 'acceptance-v2.0.6-alpha.16')
  assert.throws(() => selectBaseline(releases, '2.0.6-alpha.16'), /already published/u)
  assert.equal(selectBaseline(releases, '2.0.6-alpha.8'), undefined)
})

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
