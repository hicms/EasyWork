#!/usr/bin/env node
import { updateChannel, newerVersion } from '../apps/desktop/src/update-policy.ts'
import { listReleases } from './desktop-release-policy.mjs'

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

if (import.meta.main) {
  const version = process.env.RELEASE_VERSION
  if (!version) throw new Error('RELEASE_VERSION is required')
  const releases = await listReleases(async path => {
    const headers = { Accept: 'application/vnd.github+json' }
    if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`
    const response = await fetch(`https://api.github.com/repos/hicms/EasyWork${path}`, {
      headers, signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`GitHub release lookup failed (${response.status})`)
    return response.json()
  })
  const baseline = selectBaseline(releases, version)
  if (!baseline) throw new Error(`No published unsigned alpha baseline exists before ${version}`)
  console.log(baseline)
}
