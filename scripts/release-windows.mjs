#!/usr/bin/env node
/** Safe local entry point for the manually dispatched Windows release workflow. */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const repository = 'hicms/EasyWork'
const workflow = 'release-windows.yml'
const root = resolve(import.meta.dirname, '..')
const desktopManifest = JSON.parse(readFileSync(resolve(root, 'apps/desktop/package.json'), 'utf8'))

const usage = `Usage:
  corepack yarn release:windows [--operation=draft]
  corepack yarn release:windows --operation=publish --candidate-run=RUN_ID --acceptance-file=PATH

The command dispatches the signed Windows release workflow from the clean, pushed main branch.
draft:    Builds, signs, verifies and stages one immutable candidate draft.
publish:  Publishes that exact successful draft after actual update acceptance evidence is supplied.
` 

export function parseOptions(args) {
  if (args.includes('--help')) return { help: true }
  const options = { operation: 'draft', candidateRun: undefined, acceptanceFile: undefined, dryRun: false }
  const seen = new Set()
  for (const arg of args) {
    const [key, ...rest] = arg.split('=')
    if (seen.has(key)) throw new Error(`Duplicate option: ${key}`)
    seen.add(key)
    if (arg === '--dry-run') options.dryRun = true
    else if (key === '--operation' && ['draft', 'publish'].includes(rest.join('='))) options.operation = rest.join('=')
    else if (key === '--candidate-run' && /^[1-9]\d*$/u.test(rest.join('='))) options.candidateRun = rest.join('=')
    else if (key === '--acceptance-file' && rest.length > 0) options.acceptanceFile = rest.join('=')
    else throw new Error(`Unsupported option: ${arg}\n${usage}`)
  }
  if (options.operation === 'publish' && (!options.candidateRun || !options.acceptanceFile)) {
    throw new Error('publish requires --candidate-run=RUN_ID and --acceptance-file=PATH')
  }
  if (options.operation === 'draft' && (options.candidateRun || options.acceptanceFile)) {
    throw new Error('candidate-run and acceptance-file are only valid for publish')
  }
  return options
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function assertReleaseSource() {
  if (git(['branch', '--show-current']) !== 'main') throw new Error('Windows release must be dispatched from main')
  if (git(['status', '--porcelain']) !== '') throw new Error('Windows release requires a clean working tree')
  const commit = git(['rev-parse', 'HEAD'])
  const remoteCommit = git(['rev-parse', 'origin/main'])
  if (commit !== remoteCommit) throw new Error('HEAD must equal origin/main; push the committed release source first')
  return commit
}

function readAcceptance(path, version) {
  const resolved = resolve(root, path)
  if (!existsSync(resolved)) throw new Error(`Acceptance file not found: ${resolved}`)
  const value = JSON.parse(readFileSync(resolved, 'utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Acceptance file must contain a JSON object')
  if (value.version !== version) throw new Error(`Acceptance version must match Desktop version ${version}`)
  return JSON.stringify(value)
}

export function buildWorkflowArgs(options, { commit, version, channel, acceptanceJson } = {}) {
  const args = ['workflow', 'run', workflow, '--repo', repository, '--ref', 'main',
    '-f', `operation=${options.operation}`, '-f', `source_commit=${commit}`,
    '-f', `version=${version}`, '-f', `channel=${channel}`]
  if (options.operation === 'publish') {
    args.push('-f', `candidate_run=${options.candidateRun}`, '-f', `acceptance_json=${acceptanceJson}`)
  }
  return args
}

export function dispatch(options, run = (args) => execFileSync('gh', args, { cwd: root, encoding: 'utf8', stdio: 'inherit' })) {
  const commit = assertReleaseSource()
  const version = desktopManifest.version
  const channel = version.includes('-alpha.') ? 'alpha' : 'latest'
  const acceptanceJson = options.operation === 'publish' ? readAcceptance(options.acceptanceFile, version) : undefined
  const args = buildWorkflowArgs(options, { commit, version, channel, acceptanceJson })
  if (options.dryRun) {
    const displayed = args.map((value, index) => index > 0 && args[index - 1] === 'acceptance_json' ? '<acceptance JSON>' : value)
    console.log(`gh ${displayed.join(' ')}`)
    return { commit, version, channel, args, dryRun: true }
  }
  run(args)
  return { commit, version, channel, args, dryRun: false }
}

if (import.meta.main) {
  try {
    const options = parseOptions(process.argv.slice(2))
    if (options.help) console.log(usage)
    else dispatch(options)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
