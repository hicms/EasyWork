/** Carrier-only boot bridge consumed by the unmodified official Web entry. */
export const PRODUCT_NAME = 'EasyWork'
export const USER_DATA_DIRECTORY_NAME = PRODUCT_NAME
export const APP_SCHEME = 'easywork-app'
export const APP_ORIGIN = `${APP_SCHEME}://app`
export const APP_URL = `${APP_ORIGIN}/`
export const BOOT_IPC = { ready: 'easywork:boot-ready', failed: 'easywork:boot-failed', progress: 'easywork:boot-progress' } as const
export interface DesktopBootInfo { injections: readonly unknown[], streamBaseUrl: string }
