/** Signed releases and explicitly unsigned acceptance builds never share a tag stream. */
export const UPDATE_REPOSITORY = 'hicms/EasyWork'
export const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPOSITORY}/releases`
export type UpdateChannel = 'latest' | 'alpha'
export type UpdateMode = 'signed' | 'unsigned-acceptance'

export function updateChannel(version: string): UpdateChannel {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-alpha\.(0|[1-9]\d*))?$/u.test(version)) {
    throw new Error('更新版本必须是 x.y.z 或 x.y.z-alpha.n')
  }
  return version.includes('-') ? 'alpha' : 'latest'
}

export function releaseTag(version: string, mode: UpdateMode = 'signed'): string {
  const channel = updateChannel(version)
  if (mode === 'unsigned-acceptance' && channel !== 'alpha') throw new Error('未签名验收更新仅支持 alpha 预发布版')
  return `${mode === 'unsigned-acceptance' ? 'acceptance-v' : 'v'}${version}`
}

export function releaseDownloadUrl(version: string, mode: UpdateMode = 'signed'): string {
  return `${UPDATE_RELEASES_URL}/download/${releaseTag(version, mode)}/`
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
export function selectRelease(releases: unknown, current: string, mode: UpdateMode = 'signed'): string | undefined {
  const channel = updateChannel(current)
  releaseTag(current, mode)
  const prefix = mode === 'unsigned-acceptance' ? 'acceptance-v' : 'v'
  if (!Array.isArray(releases)) throw new Error('GitHub 更新列表无效')
  let selected: string | undefined
  for (const release of releases) {
    if (!release || release.draft !== false || typeof release.tag_name !== 'string' || !release.tag_name.startsWith(prefix)) continue
    const version = release.tag_name.slice(prefix.length)
    let candidateChannel: UpdateChannel
    try { candidateChannel = updateChannel(version) } catch { continue }
    if (candidateChannel !== channel || release.prerelease !== (channel === 'alpha') || !newerVersion(version, current)) continue
    if (!selected || newerVersion(version, selected)) selected = version
  }
  return selected
}
