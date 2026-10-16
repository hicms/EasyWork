import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWorkflowArgs, parseOptions } from './release-windows.mjs'

test('draft defaults to the current source and never needs acceptance input', () => {
  const options = parseOptions([])
  assert.deepEqual(buildWorkflowArgs(options, {
    commit: 'a'.repeat(40), version: '2.0.6-alpha.15', channel: 'alpha',
  }), [
    'workflow', 'run', 'release-windows.yml', '--repo', 'hicms/EasyWork', '--ref', 'main',
    '-f', 'operation=draft', '-f', `source_commit=${'a'.repeat(40)}`,
    '-f', 'version=2.0.6-alpha.15', '-f', 'channel=alpha',
  ])
})

test('publish requires a numeric candidate run and an acceptance file', () => {
  assert.throws(() => parseOptions(['--operation=publish']), /candidate-run/u)
  assert.throws(() => parseOptions(['--operation=publish', '--candidate-run=abc', '--acceptance-file=evidence.json']), /Unsupported option/u)
  const options = parseOptions(['--operation=publish', '--candidate-run=123', '--acceptance-file=evidence.json'])
  assert.equal(options.operation, 'publish')
})

test('unknown and conflicting options fail closed', () => {
  assert.throws(() => parseOptions(['--unknown']), /Unsupported option/u)
  assert.throws(() => parseOptions(['--dry-run', '--dry-run']), /Duplicate option/u)
  assert.throws(() => parseOptions(['--candidate-run=123']), /only valid for publish/u)
})
