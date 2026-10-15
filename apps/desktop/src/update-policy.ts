/** The two supported release streams use canonical, immutable vVERSION tags. */
export const UPDATE_REPOSITORY = 'hicms/EasyWork'
export const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPOSITORY}/releases`
export type UpdateChannel = 'latest' | 'alpha'

export function updateChannel(version: string): UpdateChannel {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-alpha\.(0|[1-9]\d*))?$/u.test(version)) {
    throw new Error('更新版本必须是 x.y.z 或 x.y.z-alpha.n')
  }
  return version.includes('-') ? 'alpha' : 'latest'
}

export function releaseDownloadUrl(version: string): string {
  updateChannel(version)
  return `${UPDATE_RELEASES_URL}/download/v${version}/`
}

export function newerVersion(left: string, right: string): boolean {
  updateChannel(left); updateChannel(right)
  const a = left.split(/[.-]/u).filter(part => part !== 'alpha').map(BigInt)
  const b = right.split(/[.-]/u).filter(part => part !== 'alpha').map(BigInt)
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (a[index] === b[index]) continue
    if (a[index] === undefined) return true
    if (b[index] === undefined) return false
    return a[index]! > b[index]!
  }
  return false
}

/** Untrusted GitHub API results cannot select drafts, another channel or tag aliases. */
export function selectRelease(releases: unknown, current: string): string | undefined {
  const channel = updateChannel(current)
  if (!Array.isArray(releases)) throw new Error('GitHub 更新列表无效')
  let selected: string | undefined
  for (const release of releases) {
    if (!release || release.draft !== false || typeof release.tag_name !== 'string' || !release.tag_name.startsWith('v')) continue
    const version = release.tag_name.slice(1)
    let candidateChannel: UpdateChannel
    try { candidateChannel = updateChannel(version) } catch { continue }
    if (candidateChannel !== channel || release.prerelease !== (channel === 'alpha') || !newerVersion(version, current)) continue
    if (!selected || newerVersion(version, selected)) selected = version
  }
  return selected
}
