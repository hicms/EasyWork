/** Bundled as one CJS file: the carrier intentionally ships no root node_modules. */
import { NsisUpdater } from 'electron-updater'
import { createReadStream, readFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { load } from 'js-yaml'
import { UPDATE_REPOSITORY, type UpdateMode } from './update-policy.ts'
import { verifyWindowsUpdateSignature } from './windows-update-signature.ts'
import { launchWindowsInstaller } from './windows-update-launch.ts'

interface Candidate { path: string; version: string; sha512: string; size: number }
type FileIdentity = Awaited<ReturnType<typeof stat>>
const sameFile = (a: FileIdentity, b: FileIdentity): boolean => a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs

class CoordinatedNsisUpdater extends NsisUpdater {
  private readonly trustedPublishers: string[]
  private candidate: Candidate | undefined
  private checkedFile: FileIdentity | undefined
  private readonly installerStarted: () => void
  constructor(publishers: string[], mode: UpdateMode, installerStarted: () => void) {
    // Passing an AppAdapter to v26's constructor disables its HTTP executor.
    super()
    this.installerStarted = installerStarted
    this.trustedPublishers = publishers
    this.verifyUpdateCodeSignature = mode === 'unsigned-acceptance'
      ? async () => null
      : (_names, path) => verifyWindowsUpdateSignature(this.trustedPublishers, path)
  }

  override async downloadUpdate(cancellationToken?: Parameters<NsisUpdater['downloadUpdate']>[0]): Promise<string[]> {
    this.candidate = undefined
    this.checkedFile = undefined
    const files = await super.downloadUpdate(cancellationToken)
    // Upstream returns a SHA-checked cache hit without invoking its signature hook.
    // The controller only exposes Restart after this promise succeeds.
    if (files.length !== 1 || !files[0]) throw new Error('Expected one NSIS installer')
    const info = this.updateInfoAndProvider?.info
    const asset = info?.files[0]
    if (!info || info.files.length !== 1 || !asset || typeof asset.size !== 'number' || !Number.isSafeInteger(asset.size)
      || asset.size <= 0 || !asset.sha512) throw new Error('Incomplete installer identity in update metadata')
    this.candidate = { path: files[0], version: info.version, sha512: asset.sha512, size: asset.size }
    await this.validateCandidate(info.version)
    return files
  }

  async validateCandidate(version: string): Promise<void> {
    this.checkedFile = undefined
    try {
      const candidate = this.candidate
      if (!candidate || candidate.version !== version || this.updateInfoAndProvider?.info.version !== version
        || this.installerPath !== candidate.path) throw new Error('Downloaded installer does not match the selected version')
      const before = await stat(candidate.path)
      if (!before.isFile() || before.size !== candidate.size) throw new Error('Downloaded installer size changed')
      const hash = createHash('sha512')
      for await (const bytes of createReadStream(candidate.path)) hash.update(bytes)
      if (hash.digest('base64') !== candidate.sha512) throw new Error('Downloaded installer SHA-512 changed')
      const failure = await this.verifyUpdateCodeSignature(this.trustedPublishers, candidate.path)
      if (failure !== null) throw new Error(failure)
      const after = await stat(candidate.path)
      if (!sameFile(before, after)) throw new Error('Downloaded installer changed during verification')
      this.checkedFile = after
    } catch (error) {
      this.candidate = undefined
      // Invalidate only the updater-owned pending cache so retry can fetch clean bytes.
      await this.downloadedUpdateHelper?.clear()
      throw error
    }
  }

  async launchAndQuit(): Promise<void> {
    const candidate = this.candidate
    if (!candidate || !this.checkedFile || !sameFile(this.checkedFile, await stat(candidate.path))) {
      throw new Error('Verified installer is no longer available; download it again')
    }
    await launchWindowsInstaller(candidate.path, dirname(process.execPath))
    this.installerStarted()
    this.app.quit()
  }
}

export function createUpdater(configPath: string, installerStarted: () => void, mode: UpdateMode = 'signed'): CoordinatedNsisUpdater {
  const config = load(readFileSync(configPath, 'utf8')) as Record<string, unknown>
  const [owner, repo] = UPDATE_REPOSITORY.split('/')
  const publishers = typeof config.publisherName === 'string' ? [config.publisherName] : config.publisherName
  const validPublishers = Array.isArray(publishers) && publishers.length > 0 && publishers.every(name => typeof name === 'string' && name.trim())
  if (config.provider !== 'github' || config.owner !== owner || config.repo !== repo
    || (mode !== 'unsigned-acceptance' && !validPublishers)
    || (mode === 'unsigned-acceptance' && publishers !== undefined)
    || typeof config.updaterCacheDirName !== 'string' || !config.updaterCacheDirName) {
    throw new Error('更新配置缺少受信任的签名发布者或缓存目录')
  }
  const updater = new CoordinatedNsisUpdater(validPublishers ? publishers as string[] : [], mode, installerStarted)
  updater.updateConfigPath = configPath
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.disableWebInstaller = true
  updater.disableDifferentialDownload = false
  return updater
}
