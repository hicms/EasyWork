import * as React from 'react';

export interface SessionCreationNoticeProps {
  source: {
    getSnapshot(): string | null;
    subscribe(listener: () => void): () => void;
  };
  dismiss(): void;
}

export function SessionCreationNotice({ source, dismiss }: SessionCreationNoticeProps) {
  const message = React.useSyncExternalStore(source.subscribe, source.getSnapshot);
  if (message === null) return null;
  const english = document.documentElement.lang.startsWith('en');
  return <aside role="alert" style={{
    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
    width: 'min(520px, calc(100vw - 32px))', maxHeight: '50vh', overflow: 'auto', boxSizing: 'border-box',
    padding: 16, borderRadius: 12, boxShadow: '0 6px 28px #0003', pointerEvents: 'auto',
    background: 'var(--dsw-alias-bg-layer-1, #fff)', color: 'var(--dsw-alias-label-primary, #252a29)',
  }}>
    <strong>{english ? 'Unable to create conversation' : '无法新建会话'}</strong>
    <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message}</p>
    <button type="button" onClick={dismiss}>{english ? 'Dismiss' : '知道了'}</button>
  </aside>;
}
