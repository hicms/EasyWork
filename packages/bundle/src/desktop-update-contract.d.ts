/** Desktop-only capability; Web and disabled builds return no update state. */
export interface DesktopUpdateSnapshot {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'verifying' | 'stopping' | 'installing' | 'error';
  version: string | undefined;
}
export interface DesktopUpdateBridge {
  get(): Promise<DesktopUpdateSnapshot | undefined>;
  subscribe(listener: (state: DesktopUpdateSnapshot) => void): () => void;
  check(): Promise<void>;
  restart(): Promise<void>;
  releaseNotes(): Promise<void>;
}
declare global {
  interface Window { easyworkUpdates?: DesktopUpdateBridge; }
}
