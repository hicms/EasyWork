#!/usr/bin/env node
import { updateChannel, newerVersion } from '../apps/desktop/src/update-policy.ts'

export function selectBaseline(releases, candidateVersion) {
  const candidates = releases.filter(release => {
    if (!release || release.draft !== false || release.prerelease !== true || typeof release.tag_name !== 'string') return false
    if (!release.tag_name.startsWith('acceptance-v')) return false
    const version = release.tag_name.slice('acceptance-v'.length)
    try { return updateChannel(version) === 'alpha' && newerVersion(candidateVersion, version) }
    catch { return false }
  })
  candidates.sort((left, right) => {
    const a = left.tag_name.slice('acceptance-v'.length), b = right.tag_name.slice('acceptance-v'.length)
    return newerVersion(a, b) ? -1 : newerVersion(b, a) ? 1 : 0
  })
  return candidates[0]?.tag_name
}

if (import.meta.main) {
  const version = process.env.RELEASE_VERSION
  if (!version) throw new Error('RELEASE_VERSION is required')
  const response = await fetch('https://api.github.com/repos/hicms/EasyWork/releases?per_page=100', {
    headers: { Accept: 'application/vnd.github+json', Authorization: process.env.GH_TOKEN ? `Bearer ${process.env.GH_TOKEN}` : undefined },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status})`)
  const baseline = selectBaseline(await response.json(), version)
  if (!baseline) throw new Error(`No published unsigned alpha baseline exists before ${version}`)
  console.log(baseline)
}
