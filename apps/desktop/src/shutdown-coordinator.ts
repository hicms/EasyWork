/** Serialize normal quit and update installation; a forced stop is never reusable as a safe stop. */
export class ShutdownCoordinator {
  private pending: Promise<void> | undefined
  private completed: 'quit' | 'update' | undefined

  private readonly stop: (reason: 'quit' | 'update') => Promise<void>
  constructor(stop: (reason: 'quit' | 'update') => Promise<void>) { this.stop = stop }

  request(reason: 'quit' | 'update'): Promise<void> {
    if (this.pending) return this.pending.then(() => this.assertReason(reason))
    if (this.completed) return Promise.resolve().then(() => this.assertReason(reason))
    this.pending = this.stop(reason).then(() => { this.completed = reason }).finally(() => { this.pending = undefined })
    return this.pending
  }

  private assertReason(reason: 'quit' | 'update'): void {
    if (reason === 'update' && this.completed !== 'update') throw new Error('普通退出不能作为安全更新的确认，请重新启动后更新')
  }
}
