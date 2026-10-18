/** Rolling user download entry. Its tag matches neither updater prefix, so clients never update from it. */
import { createHash } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { findRelease, listReleases, readReleaseManifest } from './desktop-release-policy.mjs'
import { releaseTag, UPDATE_RELEASES_URL, UPDATE_REPOSITORY, updateChannel } from '../apps/desktop/src/update-policy.ts'

export const DOWNLOAD_TAG = 'easywork-download'
export const DOWNLOAD_ASSET = 'EasyWork-x64-Setup.exe'
const STAGED_ASSET = `${DOWNLOAD_ASSET}.next`

/** A published stable release owns GitHub's Latest badge; the download release must not take it over. */
export function stableReleaseExists(releases) {
  return releases.some(release => {
    if (release.draft !== false || release.prerelease !== false || !release.tag_name?.startsWith('v')) return false
    try { return updateChannel(release.tag_name.slice(1)) === 'latest' } catch { return false }
  })
}

function description(version, tag) {
  const details = `${UPDATE_RELEASES_URL}/tag/${tag}`
  return [
    `Windows x64 安装包：下载下方的 \`${DOWNLOAD_ASSET}\`（版本 ${version}）。这是未签名的预发布版本，Windows 可能提示“未知发布者”。安装后会自动接收后续更新。`,
    `版本说明与更新文件：${details}`,
    '',
    `Windows x64 installer: download \`${DOWNLOAD_ASSET}\` below (version ${version}). This unsigned pre-release may show an unknown publisher on Windows. Installed copies receive later updates automatically.`,
    `Release details and update files: ${details}`,
  ].join('\n')
}

const base = `https://api.github.com/repos/${UPDATE_REPOSITORY}`
const headers = () => ({ Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' })
async function api(path, options = {}) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(60_000), ...options, headers: { ...headers(), 'Content-Type': 'application/json' } })
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}): ${path}`)
  return response.status === 204 ? undefined : response.json()
}
async function digest(path) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}
async function upload(release, name, path, size) {
  const target = new URL(release.upload_url.replace(/\{.*$/u, ''))
  if (target.origin !== 'https://uploads.github.com') throw new Error('Unexpected asset upload host')
  target.searchParams.set('name', name)
  const response = await fetch(target, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/octet-stream', 'Content-Length': String(size) },
    body: createReadStream(path), duplex: 'half' })
  if (!response.ok) throw new Error(`Asset upload failed: ${name} (${response.status}); the previous download remains available`)
}

async function refresh() {
  const env = process.env
  const root = resolve(env.RELEASE_DIRECTORY ?? 'release')
  const release = readReleaseManifest(join(root, 'release.json'), 'unsigned-acceptance')
  if (env.GITHUB_REPOSITORY !== UPDATE_REPOSITORY || release.sourceCommit !== env.RELEASE_COMMIT
    || release.version !== env.RELEASE_VERSION) throw new Error('Release provenance mismatch')
  const installer = release.assets.find(asset => asset.name === `EasyWork-${release.version}-x64-Setup.exe`)
  const path = join(root, installer.name)
  if (statSync(path).size !== installer.size || await digest(path) !== installer.sha256) throw new Error(`Candidate asset changed: ${installer.name}`)
  const matches = asset => asset.size === installer.size && asset.digest === `sha256:${installer.sha256}`

  const history = await listReleases(api)
  const tag = releaseTag(release.version, 'unsigned-acceptance')
  const source = findRelease(history, tag)
  if (source?.draft !== false || source.target_commitish !== release.sourceCommit
    || !source.assets.some(asset => asset.name === installer.name && matches(asset))) {
    throw new Error(`Publish the accepted release ${tag} before refreshing downloads`)
  }
  const name = `EasyWork ${release.version} 下载 / Download`
  let target = findRelease(history, DOWNLOAD_TAG)
    ?? await api('/releases', { method: 'POST', body: JSON.stringify({ tag_name: DOWNLOAD_TAG, target_commitish: release.sourceCommit, name, draft: true, prerelease: false }) })
  for (const stale of target.assets.filter(asset => asset.name === STAGED_ASSET)) await api(`/releases/assets/${stale.id}`, { method: 'DELETE' })
  const previous = target.assets.find(asset => asset.name === DOWNLOAD_ASSET)
  const uploadName = previous ? STAGED_ASSET : DOWNLOAD_ASSET
  await upload(target, uploadName, path, installer.size)
  target = await api(`/releases/${target.id}`)
  const uploaded = target.assets.find(asset => asset.name === uploadName)
  if (!uploaded || !matches(uploaded)) throw new Error('Uploaded installer differs; the previous download remains available')
  if (previous) {
    await api(`/releases/assets/${previous.id}`, { method: 'DELETE' })
    await api(`/releases/assets/${uploaded.id}`, { method: 'PATCH', body: JSON.stringify({ name: DOWNLOAD_ASSET }) })
  }
  // Publishing a draft creates the tag; a published release keeps its tag until moved explicitly.
  if (!target.draft) await api(`/git/refs/tags/${DOWNLOAD_TAG}`, { method: 'PATCH', body: JSON.stringify({ sha: release.sourceCommit, force: true }) })
  await api(`/releases/${target.id}`, { method: 'PATCH', body: JSON.stringify({ name, body: description(release.version, tag),
    target_commitish: release.sourceCommit, draft: false, prerelease: false, make_latest: stableReleaseExists(history) ? 'false' : 'true' }) })
  target = await api(`/releases/${target.id}`)
  if (target.draft || target.assets.length !== 1 || target.assets[0].name !== DOWNLOAD_ASSET || !matches(target.assets[0])) {
    throw new Error('Download release is incomplete')
  }
  console.log(`Download release: ${target.html_url}`)
}

if (import.meta.main) await refresh()
