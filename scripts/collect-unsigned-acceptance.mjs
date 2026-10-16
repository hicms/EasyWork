#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { UNSIGNED_ACCEPTANCE_SCENARIOS } from './desktop-release-policy.mjs'

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

if (import.meta.main) {
  const result = collectUnsignedAcceptance({ root: process.env.ACCEPTANCE_EVIDENCE_DIRECTORY, sourceCommit: process.env.RELEASE_COMMIT,
    version: process.env.RELEASE_VERSION, installerSha512: process.env.RELEASE_INSTALLER_SHA512, evidenceUrl: process.env.RELEASE_EVIDENCE_URL })
  writeFileSync(process.env.ACCEPTANCE_OUTPUT, JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ ok: true, scenarios: Object.keys(result.scenarios), output: process.env.ACCEPTANCE_OUTPUT }))
}
