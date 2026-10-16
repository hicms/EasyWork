import * as React from 'react';
import type { DesktopUpdateSnapshot } from '../../desktop-update-contract.js';

const styles = `
.ew-update-notice{position:fixed;right:24px;bottom:24px;z-index:1000;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 48px);padding:14px 20px 14px 16px;border-radius:14px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#252a29);box-shadow:0 6px 28px #00000018;font:13px/1.5 system-ui,sans-serif;border:1px solid #8882}
.ew-update-notice button{font:inherit;white-space:nowrap;cursor:pointer;border:1px solid #42c79c;background:transparent;color:#159b73;border-radius:6px;padding:4px 10px;line-height:1.5}
.ew-update-notice button:hover{background:#42c79c15}.ew-update-notice button:focus-visible{outline:2px solid #159b73;outline-offset:3px}
.ew-update-notice button.ew-update-restart{background:#42c79c;color:#fff;font-weight:600}.ew-update-notice button:disabled{opacity:.65;cursor:wait}
.ew-update-notice .ew-update-close{position:absolute;right:-6px;top:-8px;border:1px solid #8882;border-radius:50%;width:22px;height:22px;padding:0;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-secondary,#7b8380);box-shadow:0 2px 4px #0001}
.ew-update-symbol{color:#27bc91;font-size:20px;line-height:1}.ew-update-title{white-space:nowrap}
@media(max-width:520px){.ew-update-notice{right:16px;bottom:16px;max-width:calc(100vw - 32px);gap:8px;padding:12px;flex-wrap:wrap}}
`;

/** Mounted once in the Profile's shell.overlay; Web has no desktop capability. */
export function DesktopUpdateNotice() {
  const bridge = window.easyworkUpdates;
  const [snapshot, setSnapshot] = React.useState<DesktopUpdateSnapshot>();
  const [dismissed, setDismissed] = React.useState<string>();
  const [language, setLanguage] = React.useState(document.documentElement.lang);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    if (!bridge) return;
    let disposed = false, received = false;
    const unsubscribe = bridge.subscribe(value => { received = true; if (!disposed) setSnapshot(value); });
    void bridge.get().then(value => { if (!disposed && !received) setSnapshot(value); }).catch(() => {});
    const observer = new MutationObserver(() => setLanguage(document.documentElement.lang));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => { disposed = true; unsubscribe(); observer.disconnect(); };
  }, [bridge]);
  const busy = snapshot && ['verifying', 'stopping', 'installing'].includes(snapshot.state);
  if (!bridge || !snapshot?.version || (!busy && (snapshot.state !== 'downloaded' || dismissed === snapshot.version))) return null;
  const zh = !language.startsWith('en');
  const restart = () => { setError(false); void bridge.restart().catch(() => setError(true)); };
  return <><style>{styles}</style><aside className="ew-update-notice" role="status" aria-live="polite" aria-label={zh ? '应用更新' : 'Application update'}>
    <span className="ew-update-symbol" aria-hidden="true">↥</span>
    <span className="ew-update-title" title={snapshot.version}>{error ? (zh ? '请重试升级' : 'Please retry') : snapshot.state === 'installing' ? (zh ? '正在安装更新…' : 'Installing update…') : busy ? (zh ? '正在准备重启…' : 'Preparing restart…') : (zh ? '新版本就绪' : 'Update ready')}</span>
    <button type="button" disabled={!!busy} onClick={() => { void bridge.releaseNotes().catch(() => setError(true)); }}>{zh ? '更新日志' : 'Release notes'}</button>
    <button type="button" className="ew-update-restart" disabled={!!busy} title={zh ? '请先保存工作并结束运行中的任务' : 'Save your work and finish running tasks first'} onClick={restart}>{zh ? '重启升级' : 'Restart and update'}</button>
    <button type="button" className="ew-update-close" disabled={!!busy} aria-label={zh ? '稍后更新' : 'Update later'} onClick={() => setDismissed(snapshot.version)}>×</button>
  </aside></>;
}
