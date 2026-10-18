import childProcess from 'node:child_process'
import { appendFileSync, readFileSync } from 'node:fs'
import { updateChannel } from '../apps/desktop/src/update-policy.ts'

export function verifyReleaseSource({ commit, version, channel, defaultBranch, root }) {
  const git = args => childProcess.execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  if (!/^[a-f0-9]{40}$/u.test(commit ?? '')) throw new Error('Release source must be a full commit SHA')
  if (updateChannel(version) !== channel) throw new Error('Release channel must match version')
  if (!defaultBranch || /[\s~^:?*\[\\]/u.test(defaultBranch)) throw new Error('Invalid default branch')
  git(['merge-base', '--is-ancestor', commit, `refs/remotes/origin/${defaultBranch}`])
  const manifest = JSON.parse(git(['show', `${commit}:apps/desktop/package.json`]))
  if (manifest.version !== version) throw new Error('Version must already be committed on the default branch')
  return { commit, version, channel, tag: `v${version}`, artifact: `windows-${version}-${commit}` }
}

export const ACCEPTANCE_CHECKS = [
  'installedRuntime', 'requiredPluginUi', 'updateMenu', 'aToB', 'differentialDownload',
  'missingCacheFullDownload', 'offlineRetry', 'corruptDeltaFullDownload', 'dataPreserved',
  'ordinaryQuitDoesNotInstall', 'busyShutdownDefersInstall', 'noOwnedProcessRemains',
  'installerFailureRepair',
]
export const BOOTSTRAP_CHECKS = ['normalInstallation', 'installedRuntime', 'requiredPluginUi', 'updateMenu',
  'dataPreserved', 'ordinaryQuitDoesNotInstall', 'noOwnedProcessRemains', 'installerFailureRepair']

export const UNSIGNED_ACCEPTANCE_SCENARIOS = {
  delta: ['differentialDownload'],
  'missing-cache': ['missingCacheFullDownload'],
  'corrupt-blockmap': ['corruptDeltaFullDownload'],
  offline: ['offlineRetry', 'differentialDownload'],
}

const UNSIGNED_COMMON_CHECKS = ['normalInstallation', 'ordinaryQuitDoesNotInstall', 'aToB',
  'automaticRelaunch', 'dataPreserved', 'installedRuntime', 'requiredPluginViews', 'gracefulQuit']

export async function listReleases(api) {
  const releases = []
  for (let page = 1; ; page++) {
    const batch = await api(`/releases?per_page=100&page=${page}`)
    if (!Array.isArray(batch)) throw new Error('Invalid release history')
    releases.push(...batch)
    if (batch.length < 100) return releases
  }
}

export function findRelease(releases, tag) {
  // GET /releases/tags/TAG cannot find pending-tag drafts. Authenticated listing can.
  const matches = releases.filter(release => release.tag_name === tag)
  if (matches.length > 1) throw new Error('Multiple releases share the candidate tag')
  return matches[0]
}

export function verifyBootstrapHistory(releases, channel) {
  for (const release of releases) {
    if (release.draft !== false || !release.tag_name?.startsWith('v')) continue
    let previousChannel
    try { previousChannel = updateChannel(release.tag_name.slice(1)) } catch { continue }
    if (previousChannel === channel && release.assets.some(asset => asset.name === 'release.json')) {
      throw new Error('Bootstrap is only available before the first updater-enabled release in this channel')
    }
  }
}

export function verifyAcceptance(evidence, release) {
  if (evidence.sourceCommit !== release.sourceCommit || evidence.installerSha512 !== release.installerSha512
    || evidence.version !== release.version || evidence.channel !== release.channel) throw new Error('Acceptance must bind to the exact signed candidate')
  if (!/^https:\/\/github\.com\/hicms\/EasyWork\/(?:issues|discussions)\/\d+(?:#[-\w]+)?$/u.test(evidence.evidenceUrl ?? '')) {
    throw new Error('Acceptance requires a reviewable repository issue/discussion with results and screenshots')
  }
  if (!['bootstrap', 'upgrade'].includes(evidence.mode)) throw new Error('Acceptance mode must be bootstrap or upgrade')
  const required = evidence.mode === 'bootstrap' ? BOOTSTRAP_CHECKS : ACCEPTANCE_CHECKS
  for (const check of required) if (evidence.checks?.[check] !== true) throw new Error(`Missing actual acceptance: ${check}`)
  if (evidence.mode === 'bootstrap') {
    for (const check of ACCEPTANCE_CHECKS.filter(name => !BOOTSTRAP_CHECKS.includes(name))) {
      if (evidence.checks?.[check] === true || !evidence.unperformed?.includes(check)) throw new Error(`Bootstrap must record unperformed check: ${check}`)
    }
  }
  return evidence.evidenceUrl
}

export function verifyUnsignedAcceptance(evidence, release) {
  if (evidence.mode !== 'unsigned-acceptance' || evidence.sourceCommit !== release.sourceCommit
    || evidence.installerSha512 !== release.installerSha512 || evidence.version !== release.version
    || evidence.channel !== 'alpha') throw new Error('Unsigned acceptance must bind to the exact alpha candidate')
  if (!/^https:\/\/github\.com\/hicms\/EasyWork\/actions\/runs\/[1-9]\d*$/u.test(evidence.evidenceUrl ?? '')) {
    throw new Error('Unsigned acceptance requires the completed GitHub Actions run URL')
  }
  for (const [scenario, required] of Object.entries(UNSIGNED_ACCEPTANCE_SCENARIOS)) {
    const proof = evidence.scenarios?.[scenario]
    if (!proof || proof.ok !== true || proof.sourceCommit !== release.sourceCommit
      || proof.acceptanceCommit !== release.sourceCommit || proof.version !== release.version
      || proof.installerSha512 !== release.installerSha512) throw new Error(`Missing unsigned acceptance: ${scenario}`)
    for (const check of [...UNSIGNED_COMMON_CHECKS, ...required]) {
      if (proof.checks?.[check] !== true) throw new Error(`Missing unsigned acceptance: ${scenario}.${check}`)
    }
    if (!proof.requiredViewContent || Object.keys(proof.requiredViewContent).length !== 6) {
      throw new Error(`Unsigned acceptance did not inspect all required views: ${scenario}`)
    }
  }
  return evidence.evidenceUrl
}

export function readReleaseManifest(path, mode = 'signed') {
  const release = JSON.parse(readFileSync(path, 'utf8'))
  const trustValid = mode === 'unsigned-acceptance'
    ? release.updateMode === mode && release.channel === 'alpha' && release.publisher === undefined
    : release.updateMode !== 'unsigned-acceptance' && typeof release.publisher === 'string' && !!release.publisher.trim()
  if (!/^[a-f0-9]{40}$/u.test(release.sourceCommit ?? '') || updateChannel(release.version) !== release.channel
    || !trustValid || !Array.isArray(release.assets)
    || !/^[A-Za-z\d+/]{86}==$/u.test(release.installerSha512 ?? '')) throw new Error('Invalid release manifest')
  const installer = `EasyWork-${release.version}-x64-Setup.exe`
  const expected = [installer, `${installer}.blockmap`, `${release.channel}.yml`, 'ui-acceptance.json', 'personal.png']
  if (release.assets.length !== expected.length || new Set(release.assets.map(asset => asset.name)).size !== expected.length) throw new Error('Incomplete release asset set')
  for (const asset of release.assets) {
    if (!expected.includes(asset.name) || !Number.isSafeInteger(asset.size) || asset.size <= 0 || !/^[a-f0-9]{64}$/u.test(asset.sha256)) throw new Error('Invalid release asset')
  }
  return release
}

if (import.meta.main) {
  const env = process.env
  if (env.GITHUB_REF !== `refs/heads/${env.DEFAULT_BRANCH}`) throw new Error('Dispatch releases from the GitHub default branch')
  const release = verifyReleaseSource({ commit: env.RELEASE_COMMIT, version: env.RELEASE_VERSION, channel: env.RELEASE_CHANNEL, defaultBranch: env.DEFAULT_BRANCH, root: process.cwd() })
  for (const [name, value] of Object.entries(release)) appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`)
}
