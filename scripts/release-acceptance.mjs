#!/usr/bin/env node
/** One-command dispatcher for the unsigned alpha release workflow. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const repository = 'hicms/EasyWork'
const workflow = 'release-acceptance.yml'
const manifest = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8'))
const branch = 'main'

export function parseOptions(args) {
  if (args.includes('--help')) return { help: true }
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
    if (options.help) console.log('Usage: corepack yarn release:acceptance [--dry-run] [--no-wait]')
    else dispatch(options)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
