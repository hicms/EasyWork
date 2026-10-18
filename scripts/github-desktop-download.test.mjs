import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { selectRelease } from '../apps/desktop/src/update-policy.ts'
import { DOWNLOAD_ASSET, DOWNLOAD_TAG, stableReleaseExists } from './github-desktop-download.mjs'

// Stateful in-memory GitHub API loaded with --import; every request is appended to state.calls.
const FAKE_GITHUB = `
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
const file = process.env.FAKE_GITHUB_STATE
const reply = (status, value) => ({ ok: status < 400, status, json: async () => value, text: async () => JSON.stringify(value) })
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input)), method = init.method ?? 'GET'
  const state = JSON.parse(readFileSync(file, 'utf8'))
  const path = url.pathname.replace('/repos/hicms/EasyWork', '')
  const upload = url.host === 'uploads.github.com'
  state.calls.push(method + ' ' + path + (upload ? '?name=' + url.searchParams.get('name') : ''))
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
  const find = id => state.releases.find(release => release.id === Number(id))
  let result = reply(404, {}), match
  if (upload && (match = path.match(/^\\/releases\\/(\\d+)\\/assets$/))) {
    const hash = createHash('sha256'); let size = 0
    for await (const chunk of init.body) { hash.update(chunk); size += chunk.length }
    const asset = { id: state.nextId++, name: url.searchParams.get('name'), size, digest: 'sha256:' + hash.digest('hex') }
    find(match[1]).assets.push(asset); result = reply(201, asset)
  } else if (method === 'GET' && path === '/releases') {
    result = reply(200, url.searchParams.get('page') === '1' ? state.releases : [])
  } else if (method === 'POST' && path === '/releases') {
    const id = state.nextId++
    const release = { ...body, id, assets: [], html_url: 'https://github.com/hicms/EasyWork/releases/tag/' + body.tag_name,
      upload_url: 'https://uploads.github.com/repos/hicms/EasyWork/releases/' + id + '/assets{?name,label}' }
    state.releases.push(release); result = reply(201, release)
  } else if ((match = path.match(/^\\/releases\\/(\\d+)$/))) {
    const release = find(match[1])
    if (method === 'PATCH') {
      Object.assign(release, body)
      if (!release.draft && !state.refs[release.tag_name]) state.refs[release.tag_name] = release.target_commitish
    }
    result = reply(200, release)
  } else if ((match = path.match(/^\\/releases\\/assets\\/(\\d+)$/))) {
    const owner = state.releases.find(release => release.assets.some(asset => asset.id === Number(match[1])))
    const asset = owner.assets.find(candidate => candidate.id === Number(match[1]))
    if (method === 'DELETE') { owner.assets = owner.assets.filter(candidate => candidate !== asset); result = reply(204) }
    else if (method === 'PATCH') { asset.name = body.name; result = reply(200, asset) }
  } else if (method === 'PATCH' && (match = path.match(/^\\/git\\/refs\\/tags\\/(.+)$/))) {
    state.refs[match[1]] = body.sha; result = reply(200, {})
  }
  writeFileSync(file, JSON.stringify(state))
  return result
}
`

const commit = 'b'.repeat(40)
const version = '2.0.6-alpha.19'
const installerName = `EasyWork-${version}-x64-Setup.exe`

function fixture(context, { sourceDraft = false, sourceDigest, sourceTarget = commit, releases = [], refs = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'easywork-download-'))
  context.after(() => rmSync(root, { recursive: true, force: true }))
  const bytes = Buffer.from('accepted installer bytes')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const release = join(root, 'release')
  mkdirSync(release)
  writeFileSync(join(release, installerName), bytes)
  const others = [`${installerName}.blockmap`, 'alpha.yml', 'ui-acceptance.json', 'personal.png'].map(name => ({ name, size: 1, sha256: 'c'.repeat(64) }))
  writeFileSync(join(release, 'release.json'), JSON.stringify({
    sourceCommit: commit, version, channel: 'alpha', updateMode: 'unsigned-acceptance', installerSha512: `${'A'.repeat(86)}==`,
    assets: [{ name: installerName, size: bytes.length, sha256 }, ...others],
  }))
  const source = { id: 1, tag_name: `acceptance-v${version}`, draft: sourceDraft, prerelease: true, target_commitish: sourceTarget,
    assets: [{ id: 2, name: installerName, size: bytes.length, digest: `sha256:${sourceDigest ?? sha256}` }] }
  const state = join(root, 'github.json')
  writeFileSync(state, JSON.stringify({ releases: [source, ...releases], refs, nextId: 100, calls: [] }))
  const fake = join(root, 'fake-github.mjs')
  writeFileSync(fake, FAKE_GITHUB)
  return { release, state, fake, sha256, read: () => JSON.parse(readFileSync(state, 'utf8')) }
}

function refresh(fixture) {
  return execFileSync(process.execPath, ['--import', pathToFileURL(fixture.fake).href,
    fileURLToPath(new URL('./github-desktop-download.mjs', import.meta.url))], {
    encoding: 'utf8', stdio: 'pipe', windowsHide: true,
    env: { ...process.env, GH_TOKEN: 'token', GITHUB_REPOSITORY: 'hicms/EasyWork', RELEASE_COMMIT: commit,
      RELEASE_VERSION: version, RELEASE_DIRECTORY: fixture.release, FAKE_GITHUB_STATE: fixture.state },
  })
}

const downloadRelease = state => state.releases.find(release => release.tag_name === DOWNLOAD_TAG)

test('updaters never select the download release and only published stable tags count as stable', () => {
  const download = { tag_name: DOWNLOAD_TAG, draft: false, prerelease: false }
  assert.equal(selectRelease([download], '2.0.6-alpha.18', 'unsigned-acceptance'), undefined)
  assert.equal(selectRelease([{ ...download, prerelease: true }], '2.0.6-alpha.18', 'unsigned-acceptance'), undefined)
  assert.equal(selectRelease([download], '2.0.0'), undefined)
  assert.equal(stableReleaseExists([download,
    { tag_name: 'acceptance-v2.0.6-alpha.19', draft: false, prerelease: true },
    { tag_name: 'v2.1.0', draft: true, prerelease: false },
    { tag_name: 'v2.1.0-alpha.1', draft: false, prerelease: true }]), false)
  assert.equal(stableReleaseExists([{ tag_name: 'v2.1.0', draft: false, prerelease: false }]), true)
})

test('first refresh publishes a Latest download release containing only the accepted installer', context => {
  const github = fixture(context)
  refresh(github)
  const state = github.read()
  const download = downloadRelease(state)
  assert.equal(download.draft, false)
  assert.equal(download.prerelease, false)
  assert.equal(download.make_latest, 'true')
  assert.deepEqual(download.assets.map(asset => [asset.name, asset.digest]), [[DOWNLOAD_ASSET, `sha256:${github.sha256}`]])
  assert.equal(state.refs[DOWNLOAD_TAG], commit)
  assert.match(download.body, /2\.0\.6-alpha\.19/u)
  assert.match(download.body, /releases\/tag\/acceptance-v2\.0\.6-alpha\.19/u)
  assert(!state.calls.some(call => call.startsWith('PATCH /git/refs')))
})

test('refresh replaces the installer only after the new upload and leaves Latest to a stable release', context => {
  const previous = { id: 10, tag_name: DOWNLOAD_TAG, draft: false, prerelease: false,
    upload_url: 'https://uploads.github.com/repos/hicms/EasyWork/releases/10/assets{?name,label}',
    assets: [{ id: 11, name: DOWNLOAD_ASSET, size: 3, digest: `sha256:${'d'.repeat(64)}` },
      { id: 12, name: `${DOWNLOAD_ASSET}.next`, size: 1, digest: `sha256:${'e'.repeat(64)}` }] }
  const stable = { id: 20, tag_name: 'v2.0.0', draft: false, prerelease: false, assets: [] }
  const github = fixture(context, { releases: [previous, stable], refs: { [DOWNLOAD_TAG]: 'a'.repeat(40) } })
  refresh(github)
  const state = github.read()
  assert.deepEqual(state.calls.filter(call => !call.startsWith('GET')), [
    'DELETE /releases/assets/12',
    `POST /releases/10/assets?name=${DOWNLOAD_ASSET}.next`,
    'DELETE /releases/assets/11',
    'PATCH /releases/assets/100',
    `PATCH /git/refs/tags/${DOWNLOAD_TAG}`,
    'PATCH /releases/10',
  ])
  const download = downloadRelease(state)
  assert.deepEqual(download.assets.map(asset => [asset.name, asset.digest]), [[DOWNLOAD_ASSET, `sha256:${github.sha256}`]])
  assert.equal(download.make_latest, 'false')
  assert.equal(state.refs[DOWNLOAD_TAG], commit)
})

test('refresh refuses unpublished, retargeted or different installers without touching downloads', context => {
  for (const options of [{ sourceDraft: true }, { sourceDigest: 'f'.repeat(64) }, { sourceTarget: 'a'.repeat(40) }]) {
    const github = fixture(context, options)
    assert.throws(() => refresh(github), error => /Publish the accepted release/u.test(error.stderr))
    assert(github.read().calls.every(call => call.startsWith('GET')))
  }
  const github = fixture(context)
  writeFileSync(join(github.release, installerName), 'tampered')
  assert.throws(() => refresh(github), error => /Candidate asset changed/u.test(error.stderr))
  assert.deepEqual(github.read().calls, [])
})
