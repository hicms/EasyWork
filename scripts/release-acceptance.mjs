#!/usr/bin/env node
/** One-command dispatcher for the unsigned alpha release workflow. */
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { verifyTrackedBilingualRecords } from './bilingual-docs.mjs'
import { listReleases, UNSIGNED_ACCEPTANCE_SCENARIOS } from './desktop-release-policy.mjs'
import { updateChannel, newerVersion } from '../apps/desktop/src/update-policy.ts'

const root = resolve(import.meta.dirname, '..')
const repository = 'hicms/EasyWork'
const workflow = 'release-acceptance.yml'
const manifest = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8'))
const branch = 'main'

export function parseOptions(args) {
  if (args.includes('--help')) return { help: true }
  if (args.length === 1 && ['baseline', 'collect'].includes(args[0])) return { command: args[0] }
  const options = { dryRun: false, wait: true }
  const seen = new Set()
  for (const arg of args) {
    if (seen.has(arg)) throw new Error(`Duplicate option: ${arg}`)
    seen.add(arg)
    if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--no-wait') options.wait = false
    else throw new Error(`Unsupported option: ${arg}`)
  }
  return options
}

function git(args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() }

export function selectBaseline(releases, candidateVersion) {
  if (releases.some(release => release.tag_name === `acceptance-v${candidateVersion}` && release.draft === false)) {
    throw new Error(`Version ${candidateVersion} is already published; commit a newer alpha version before releasing`)
  }
  const candidates = releases.filter(release => {
    if (!release || release.draft !== false || release.prerelease !== true || typeof release.tag_name !== 'string') return false
    if (!release.tag_name.startsWith('acceptance-v')) return false
    const version = release.tag_name.slice('acceptance-v'.length)
    try { return updateChannel(version) === 'alpha' && newerVersion(candidateVersion, version) }
    catch { return false }
  })
  candidates.sort((left, right) => {
    const leftVersion = left.tag_name.slice('acceptance-v'.length)
    const rightVersion = right.tag_name.slice('acceptance-v'.length)
    return newerVersion(leftVersion, rightVersion) ? -1 : newerVersion(rightVersion, leftVersion) ? 1 : 0
  })
  return candidates[0]?.tag_name
}

async function printBaseline() {
  const version = process.env.RELEASE_VERSION
  if (!version) throw new Error('RELEASE_VERSION is required')
  const releases = await listReleases(async path => {
    const headers = { Accept: 'application/vnd.github+json' }
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`
    const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      headers, signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status})`)
    return response.json()
  })
  const baseline = selectBaseline(releases, version)
  if (!baseline) throw new Error(`No published unsigned alpha baseline exists before ${version}`)
  console.log(baseline)
}

function findProofs(root, result = {}) {
  if (!existsSync(root)) return result
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) findProofs(path, result)
    else if (entry.name === 'acceptance.json') {
      const proof = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''))
      if (typeof proof.scenario === 'string') result[proof.scenario] = proof
    }
  }
  return result
}

export function collectUnsignedAcceptance({ root, sourceCommit, version, installerSha512, evidenceUrl }) {
  const scenarios = findProofs(resolve(root))
  for (const scenario of Object.keys(UNSIGNED_ACCEPTANCE_SCENARIOS)) assert(scenarios[scenario], `Missing evidence for ${scenario}`)
  for (const proof of Object.values(scenarios)) {
    assert.equal(proof.sourceCommit, sourceCommit)
    assert.equal(proof.acceptanceCommit, sourceCommit)
    assert.equal(proof.version, version)
    assert.equal(proof.installerSha512, installerSha512)
  }
  return { mode: 'unsigned-acceptance', evidenceUrl, sourceCommit, version, channel: 'alpha', installerSha512, scenarios }
}

export function releaseInputs({ commit, version }) {
  if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error('Release source must be a full commit SHA')
  if (!/^\d+\.\d+\.\d+-alpha\.\d+$/u.test(version)) throw new Error('Unsigned acceptance releases require an alpha version')
  return { source_commit: commit, version }
}

export function buildWorkflowArgs({ commit, version }) {
  const inputs = releaseInputs({ commit, version })
  return ['workflow', 'run', workflow, '--repo', repository, '--ref', branch,
    '-f', `source_commit=${inputs.source_commit}`, '-f', `version=${inputs.version}`]
}

function findRun(commit, after, list) {
  const candidates = list.filter(item => item.headSha === commit && item.workflowName === 'Unsigned Windows acceptance release'
    && Date.parse(item.createdAt) >= after - 30_000)
  return candidates.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0]?.databaseId
}

function waitForRun(commit, dispatchedAt) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    const runs = JSON.parse(execFileSync('gh', ['run', 'list', '--repo', repository, '--workflow', workflow, '--branch', branch,
      '--limit', '20', '--json', 'databaseId,headSha,status,createdAt,workflowName'], { cwd: root, encoding: 'utf8' }))
    const runId = findRun(commit, dispatchedAt, runs)
    if (runId) return runId
    execFileSync(process.platform === 'win32' ? 'powershell.exe' : 'sleep',
      process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', 'Start-Sleep -Seconds 2'] : ['2'],
      { cwd: root, stdio: 'ignore' })
  }
  throw new Error('Workflow dispatched, but its run could not be located within two minutes')
}

export function dispatch(options, run = args => execFileSync('gh', args, { cwd: root, encoding: 'utf8', stdio: 'inherit' })) {
  if (git(['branch', '--show-current']) !== 'main') throw new Error('Unsigned release must be dispatched from main')
  if (git(['status', '--porcelain']) !== '') throw new Error('Unsigned release requires a clean working tree')
  const commit = git(['rev-parse', 'HEAD'])
  if (commit !== git(['rev-parse', 'origin/main'])) throw new Error('HEAD must equal origin/main; push the committed release source first')
  const inputs = releaseInputs({ commit, version: manifest.version })
  const args = buildWorkflowArgs({ commit, version: inputs.version })
  if (options.dryRun) { console.log(`gh ${args.join(' ')}`); return { args, dryRun: true } }
  const remoteCommit = git(['ls-remote', 'origin', `refs/heads/${branch}`]).split(/\s/u)[0]
  if (commit !== remoteCommit) throw new Error('Remote main has changed; synchronize the release source before dispatching')
  verifyTrackedBilingualRecords(root)
  const releases = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`], {
    cwd: root, encoding: 'utf8',
  })).flat()
  const baseline = selectBaseline(releases, inputs.version)
  if (!baseline) throw new Error(`No published unsigned alpha baseline exists before ${inputs.version}`)
  console.log(`Releasing ${inputs.version}; update baseline: ${baseline}`)
  const dispatchedAt = Date.now()
  run(args)
  if (options.wait) {
    const runId = waitForRun(commit, dispatchedAt)
    execFileSync('gh', ['run', 'watch', String(runId), '--repo', repository, '--exit-status'], { cwd: root, stdio: 'inherit' })
    execFileSync('gh', ['release', 'view', `acceptance-v${inputs.version}`, '--repo', repository, '--json', 'url,isDraft'], { cwd: root, stdio: 'inherit' })
  }
  return { args, runId: options.wait ? 'watched' : undefined, dryRun: false }
}

if (import.meta.main) {
  try {
    const options = parseOptions(process.argv.slice(2))
    if (options.help) console.log('Usage: corepack yarn release:acceptance [--dry-run] [--no-wait]\n       corepack yarn release:acceptance baseline|collect')
    else if (options.command === 'baseline') await printBaseline()
    else if (options.command === 'collect') {
      const result = collectUnsignedAcceptance({ root: process.env.ACCEPTANCE_EVIDENCE_DIRECTORY, sourceCommit: process.env.RELEASE_COMMIT,
        version: process.env.RELEASE_VERSION, installerSha512: process.env.RELEASE_INSTALLER_SHA512, evidenceUrl: process.env.RELEASE_EVIDENCE_URL })
      writeFileSync(process.env.ACCEPTANCE_OUTPUT, JSON.stringify(result, null, 2) + '\n')
      console.log(JSON.stringify({ ok: true, scenarios: Object.keys(result.scenarios), output: process.env.ACCEPTANCE_OUTPUT }))
    } else dispatch(options)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
