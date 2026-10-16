import { PRODUCT_NAME } from './startup-contract.ts'

interface UpdateNotification {
  show(): void
}

export interface UpdateNotificationPort {
  isSupported(): boolean
  create(options: { title: string; body: string }): UpdateNotification
}

/** Inform the user after the installer has detached and the main window is about to close. */
export function showUpdateStartedNotification(language: string | undefined, port: UpdateNotificationPort): boolean {
  try {
    if (!port.isSupported()) return false
    const english = language?.startsWith('en') ?? false
    port.create({
      title: PRODUCT_NAME,
      body: english
        ? 'Installing the update. EasyWork will reopen when it is finished.'
        : '正在安装更新，完成后 EasyWork 会自动重新打开。',
    }).show()
    return true
  } catch {
    // A blocked or unavailable system notification must never prevent installation.
    return false
  }
}
