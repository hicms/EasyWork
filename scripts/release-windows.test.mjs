import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
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

test('policy CLI preserves source outputs and rejects invalid release provenance before writing', context => {
  const directory = mkdtempSync(join(tmpdir(), 'easywork-release-source-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  const output = join(directory, 'github-output.txt')
  const commit = 'a'.repeat(40)
  const env = { ...process.env, GITHUB_REF: 'refs/heads/main', DEFAULT_BRANCH: 'main',
    RELEASE_COMMIT: commit, RELEASE_VERSION: '2.1.0', RELEASE_CHANNEL: 'latest', GITHUB_OUTPUT: output }
  const setup = `import childProcess from 'node:child_process'; childProcess.execFileSync = (_command, args) => args[0] === 'show' ? '{"version":"2.1.0"}' : ''`
  const args = ['--import', 'data:text/javascript,' + encodeURIComponent(setup), fileURLToPath(new URL('./desktop-release-policy.mjs', import.meta.url))]
  execFileSync(process.execPath, args, { env, stdio: 'pipe', windowsHide: true })
  const contents = readFileSync(output, 'utf8')
  assert.equal(contents, `commit=${commit}\nversion=2.1.0\nchannel=latest\ntag=v2.1.0\nartifact=windows-2.1.0-${commit}\n`)
  for (const [change, message] of [
    [{ GITHUB_REF: 'refs/heads/review' }, /default branch/u],
    [{ RELEASE_COMMIT: 'main' }, /full commit SHA/u],
    [{ RELEASE_CHANNEL: 'alpha' }, /channel must match/u],
    [{ RELEASE_VERSION: '2.1.1' }, /already be committed/u],
  ]) {
    assert.throws(() => execFileSync(process.execPath, args, { env: { ...env, ...change }, encoding: 'utf8', stdio: 'pipe', windowsHide: true }), error => message.test(error.stderr))
    assert.equal(readFileSync(output, 'utf8'), contents)
  }
})
