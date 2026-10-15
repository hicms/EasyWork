/** Called only by the manually dispatched release jobs. Never replaces published assets. */
import { createHash } from 'node:crypto'
import { createReadStream, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { findRelease, listReleases, readReleaseManifest, verifyAcceptance, verifyBootstrapHistory } from './desktop-release-policy.mjs'
import { UPDATE_REPOSITORY } from '../apps/desktop/src/update-policy.ts'

const env = process.env
const root = resolve(env.RELEASE_DIRECTORY ?? 'release')
const release = readReleaseManifest(join(root, 'release.json'))
if (env.GITHUB_REPOSITORY !== UPDATE_REPOSITORY || release.sourceCommit !== env.RELEASE_COMMIT
  || release.version !== env.RELEASE_VERSION || release.channel !== env.RELEASE_CHANNEL) throw new Error('Release provenance mismatch')
const tag = `v${release.version}`
const base = `https://api.github.com/repos/${UPDATE_REPOSITORY}`
const headers = { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
async function api(path, options = {}, optional = false) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(60_000), ...options, headers: { ...headers, 'Content-Type': 'application/json', ...options.headers } })
  if (optional && response.status === 404) return undefined
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}): ${path}`)
  return response.status === 204 ? undefined : response.json()
}
async function digest(path) {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest('hex')
}
const assets = [...release.assets]
assets.push({ name: 'release.json', size: statSync(join(root, 'release.json')).size, sha256: await digest(join(root, 'release.json')) })
for (const asset of assets) {
  if (statSync(join(root, asset.name)).size !== asset.size || await digest(join(root, asset.name)) !== asset.sha256) throw new Error(`Candidate asset changed: ${asset.name}`)
}
const mode = env.RELEASE_OPERATION
if (!['draft', 'publish'].includes(mode)) throw new Error('Invalid release operation')
const history = await listReleases(api)
if (mode === 'publish') {
  const acceptance = JSON.parse(env.RELEASE_ACCEPTANCE ?? '{}')
  verifyAcceptance(acceptance, release)
  if (acceptance.mode === 'bootstrap') verifyBootstrapHistory(history, release.channel)
  writeFileSync(join(root, 'acceptance.json'), JSON.stringify(acceptance, null, 2) + '\n')
  assets.push({ name: 'acceptance.json', size: statSync(join(root, 'acceptance.json')).size, sha256: await digest(join(root, 'acceptance.json')) })
}
if (readdirSync(root).some(name => !assets.some(asset => asset.name === name))) throw new Error('Unexpected files in release artifact')

// A tag may already exist, but must never resolve to another source commit.
let ref = await api(`/git/ref/tags/${tag}`, {}, true)
for (let depth = 0; ref?.object?.type === 'tag' && depth < 5; depth++) ref = await api(`/git/tags/${ref.object.sha}`)
if (ref && (ref.object?.type !== 'commit' || ref.object.sha !== release.sourceCommit)) throw new Error('Release tag points to a different commit')
let remote = findRelease(history, tag)
if (remote && (!remote.draft || remote.target_commitish !== release.sourceCommit || remote.prerelease !== (release.channel === 'alpha'))) throw new Error('Refusing to replace or retarget an existing release')
if (!remote) {
  if (mode !== 'draft') throw new Error('Create and accept the draft before publishing')
  remote = await api('/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, target_commitish: release.sourceCommit,
    name: `EasyWork ${release.version}`, draft: true, prerelease: release.channel === 'alpha',
    body: 'Windows x64 NSIS candidate. Includes signed Setup, matching blockmap and channel metadata. Actual update acceptance is required before publication.',
  }) })
}
for (const asset of assets) {
  const existing = remote.assets.find(candidate => candidate.name === asset.name)
  if (existing) {
    if (existing.size !== asset.size || existing.digest !== `sha256:${asset.sha256}`) throw new Error(`Immutable asset differs: ${asset.name}`)
    continue
  }
  if (mode === 'publish' && asset.name !== 'acceptance.json') throw new Error('Publish refuses an incomplete draft')
  const upload = new URL(remote.upload_url.replace(/\{.*$/u, ''))
  if (upload.origin !== 'https://uploads.github.com') throw new Error('Unexpected asset upload host')
  upload.searchParams.set('name', asset.name)
  const response = await fetch(upload, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': String(asset.size) },
    body: createReadStream(join(root, asset.name)), duplex: 'half',
  })
  if (!response.ok) throw new Error(`Asset upload failed: ${asset.name} (${response.status}); release remains a draft`)
}
remote = await api(`/releases/${remote.id}`)
if (remote.assets.length !== assets.length || assets.some(asset => !remote.assets.some(candidate => candidate.name === asset.name
  && candidate.size === asset.size && candidate.digest === `sha256:${asset.sha256}`))) throw new Error('Remote draft is incomplete or changed')
if (mode === 'publish') {
  await api(`/releases/${remote.id}`, { method: 'PATCH', body: JSON.stringify({ draft: false, prerelease: release.channel === 'alpha', make_latest: release.channel === 'latest' ? 'true' : 'false' }) })
}
console.log(`${mode === 'publish' ? 'Published' : 'Complete draft'}: ${remote.html_url}`)
