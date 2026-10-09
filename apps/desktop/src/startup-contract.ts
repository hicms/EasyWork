/** Carrier-only boot bridge consumed by the unmodified official Web entry. */
export const PRODUCT_NAME = 'EasyWork'
// Keep the existing personal Home and command context through display-name changes.
export const USER_DATA_DIRECTORY_NAME = 'WorkDSH'
export const APP_SCHEME = 'workdsh-app'
export const APP_ORIGIN = `${APP_SCHEME}://app`
export const APP_URL = `${APP_ORIGIN}/`
export const BOOT_IPC = { ready: 'workdsh:boot-ready', failed: 'workdsh:boot-failed' } as const
export interface DesktopBootInfo { injections: readonly unknown[], streamBaseUrl: string }
