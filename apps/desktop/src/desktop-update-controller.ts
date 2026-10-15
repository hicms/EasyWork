import type { createUpdater } from './updater-runtime.ts'
import { releaseDownloadUrl, updateChannel, type UpdateMode } from './update-policy.ts'

export type UpdateState = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'verifying' | 'stopping' | 'installing' | 'error'
type Updater = Pick<ReturnType<typeof createUpdater>, 'on' | 'setFeedURL' | 'checkForUpdates' | 'downloadUpdate' | 'validateCandidate' | 'launchAndQuit'
  | 'channel' | 'allowDowngrade' | 'allowPrerelease' | 'previousBlockmapBaseUrlOverride'>
interface Operations {
  currentVersion: string
  mode?: UpdateMode
  discover(): Promise<string | undefined>
  changed(): void
  error(error: unknown): void
  prepareInstall(): Promise<void>
  installFailed(): void
}

export class DesktopUpdateController {
  state: UpdateState = 'idle'
  version: string | undefined
  percent = 0
  private checkPending: Promise<void> | undefined
  private downloadPending: Promise<void> | undefined
  private installPending: Promise<void> | undefined
  private suspended = false
  private readonly updater: Updater
  private readonly operations: Operations

  constructor(updater: Updater, operations: Operations) {
    this.updater = updater
    this.operations = operations
    updater.on('download-progress', progress => {
      if (this.state !== 'downloading') return
      this.percent = progress.percent
      operations.changed()
    })
    // Every operation rejects its promise; retain an error listener for upstream events.
    updater.on('error', error => {
      if (this.state !== 'installing') return
      operations.installFailed()
      this.fail(error)
    })
  }

  suspend(): void { this.suspended = true }

  check(): Promise<void> {
    if (this.checkPending) return this.checkPending
    if (this.suspended || !['idle', 'error', 'available'].includes(this.state)) return Promise.resolve()
    this.setState('checking')
    this.checkPending = this.performCheck().catch(error => { this.fail(error) }).finally(() => { this.checkPending = undefined })
    return this.checkPending
  }

  private async performCheck(): Promise<void> {
    const version = await this.operations.discover()
    if (this.suspended) return
    if (!version) { this.version = undefined; this.setState('idle'); return }
    const channel = updateChannel(this.operations.currentVersion)
    if (updateChannel(version) !== channel) throw new Error('更新渠道不匹配')
    this.updater.channel = channel
    this.updater.allowDowngrade = false // channel setter enables downgrades by default
    this.updater.allowPrerelease = channel === 'alpha'
    this.updater.previousBlockmapBaseUrlOverride = releaseDownloadUrl(this.operations.currentVersion, this.operations.mode)
    this.updater.setFeedURL({ provider: 'generic', url: releaseDownloadUrl(version, this.operations.mode), channel, useMultipleRangeRequest: false })
    const result = await this.updater.checkForUpdates()
    if (this.suspended) return
    if (!result || result.updateInfo.version !== version) throw new Error('更新清单与所选发行版本不匹配')
    this.version = version
    this.setState('available')
    await this.download()
  }

  download(): Promise<void> {
    if (this.downloadPending) return this.downloadPending
    if (this.suspended || this.state !== 'available') return Promise.resolve()
    this.percent = 0
    this.setState('downloading')
    this.downloadPending = this.updater.downloadUpdate().then(() => {
      if (!this.suspended) this.setState('downloaded')
    }).catch(error => { this.fail(error) }).finally(() => { this.downloadPending = undefined })
    return this.downloadPending
  }

  install(): Promise<void> {
    if (this.installPending) return this.installPending
    if (this.suspended || this.state !== 'downloaded') return Promise.resolve()
    this.setState('verifying')
    let stopping = false
    this.installPending = this.updater.validateCandidate(this.version!).then(async () => {
      if (this.suspended) return
      this.setState('stopping')
      stopping = true
      await this.operations.prepareInstall()
      this.setState('installing')
      await this.updater.launchAndQuit()
    }).catch(error => {
      if (stopping) this.operations.installFailed()
      this.fail(error)
    }).finally(() => { this.installPending = undefined })
    return this.installPending
  }

  private setState(state: UpdateState): void { this.state = state; this.operations.changed() }
  private fail(error: unknown): void {
    if (this.suspended) return
    this.setState('error')
    this.operations.error(error)
  }
}
