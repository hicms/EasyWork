import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildWorkflowArgs, collectUnsignedAcceptance, parseOptions, releaseInputs, selectBaseline } from './release-acceptance.mjs'

function runAcceptance(args, env, setup) {
  return execFileSync(process.execPath, [
    ...(setup ? ['--import', 'data:text/javascript,' + encodeURIComponent(setup)] : []),
    fileURLToPath(new URL('./release-acceptance.mjs', import.meta.url)), ...args,
  ], { encoding: 'utf8', env: { ...process.env, ...env }, stdio: 'pipe', windowsHide: true })
}

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
  for (const command of ['baseline', 'collect']) {
    assert.deepEqual(parseOptions([command]), { command })
    assert.throws(() => parseOptions([command, '--dry-run']), /Unsupported option/u)
  }
})

test('baseline CLI uses release history without dispatching or requiring a clean checkout', () => {
  const releases = ['2.0.6-alpha.9', '2.0.6-alpha.16'].map(version => ({
    tag_name: `acceptance-v${version}`, draft: false, prerelease: true,
  }))
  const setup = `globalThis.fetch = async () => ({ ok: true, json: async () => ${JSON.stringify(releases)} })`
  assert.equal(runAcceptance(['baseline'], { RELEASE_VERSION: '2.0.6-alpha.18', GH_TOKEN: '' }, setup), 'acceptance-v2.0.6-alpha.16\n')
  for (const [version, message] of [['2.0.6-alpha.16', /already published/u], ['2.0.6-alpha.8', /No published/u], ['', /RELEASE_VERSION is required/u]]) {
    assert.throws(() => runAcceptance(['baseline'], { RELEASE_VERSION: version }, setup), error => message.test(error.stderr))
  }
})

test('collection CLI preserves exact candidate bindings and rejects missing or foreign evidence', context => {
  const root = mkdtempSync(join(tmpdir(), 'easywork-acceptance-collection-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const sourceCommit = 'a'.repeat(40)
  const version = '2.0.6-alpha.18'
  const installerSha512 = 'candidate-installer-hash'
  const evidenceUrl = 'https://github.com/hicms/EasyWork/actions/runs/123'
  const scenarios = ['delta', 'missing-cache', 'corrupt-blockmap', 'offline']
  for (const scenario of scenarios) {
    mkdirSync(join(root, scenario))
    writeFileSync(join(root, scenario, 'acceptance.json'), JSON.stringify({ scenario, sourceCommit, acceptanceCommit: sourceCommit, version, installerSha512 }))
  }
  const output = join(root, 'collected.json')
  const summary = JSON.parse(runAcceptance(['collect'], {
    ACCEPTANCE_EVIDENCE_DIRECTORY: root, ACCEPTANCE_OUTPUT: output,
    RELEASE_COMMIT: sourceCommit, RELEASE_VERSION: version,
    RELEASE_INSTALLER_SHA512: installerSha512, RELEASE_EVIDENCE_URL: evidenceUrl,
  }))
  assert.equal(summary.ok, true)
  assert.deepEqual(summary.scenarios.sort(), [...scenarios].sort())
  const options = { root, sourceCommit, version, installerSha512, evidenceUrl }
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), collectUnsignedAcceptance(options))
  const proofFile = join(root, 'delta/acceptance.json')
  const proof = JSON.parse(readFileSync(proofFile, 'utf8'))
  for (const field of ['sourceCommit', 'acceptanceCommit', 'version', 'installerSha512']) {
    writeFileSync(proofFile, JSON.stringify({ ...proof, [field]: 'foreign-candidate' }))
    assert.throws(() => collectUnsignedAcceptance(options))
  }
  writeFileSync(proofFile, JSON.stringify(proof))
  rmSync(join(root, 'offline/acceptance.json'))
  assert.throws(() => collectUnsignedAcceptance(options), /Missing evidence for offline/u)
})
