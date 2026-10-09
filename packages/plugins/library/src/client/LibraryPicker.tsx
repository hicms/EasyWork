import * as React from 'react';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { Icon } from 'workdsh-ui';
import type { LibraryTreeEntry } from 'workdsh-contracts/library';
import type { LibraryClient } from './management.js';
import { libraryPickerRequestedEvent } from './selection-events.js';

type Props = PropsRuntime<'conversation.input.left'> & {
  management: LibraryClient;
  openLibrary: () => void;
  addReference: (sessionId: string, entry: LibraryTreeEntry) => boolean;
};
const css = `
.wd-library-picker{position:relative;display:flex;align-items:center}
.wd-library-picker-trigger{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer}
.wd-library-picker-trigger:hover,.wd-library-picker-trigger[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.wd-library-popover{position:absolute;z-index:90;left:0;bottom:calc(100% + 10px);width:336px;max-height:min(430px,60vh);overflow:auto;padding:8px;border-radius:15px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-panel);font:14px/20px "PingFang SC","Microsoft YaHei",sans-serif}
.wd-library-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 5px;border-radius:10px}.wd-library-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.wd-library-main{display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px;align-items:center;min-width:0;border:0;background:transparent;color:inherit;text-align:left;font:inherit;padding:0;cursor:pointer}
.wd-library-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover)}
.wd-library-copy{min-width:0}.wd-library-copy strong,.wd-library-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wd-library-copy small{margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:11px}
.wd-library-action,.wd-library-manage,.wd-library-back{border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;padding:6px 8px;border-radius:8px}.wd-library-action:disabled{opacity:.5;cursor:default}
.wd-library-manage{display:flex;gap:8px;width:100%;margin-top:6px;padding:10px 9px;border-top:1px solid var(--dsw-alias-border-l2);border-radius:0;text-align:left}.wd-library-manage:hover{background:var(--dsw-alias-interactive-bg-hover)}
.wd-library-status{padding:12px;color:var(--dsw-alias-label-secondary)}
@media(max-width:560px){.wd-library-popover{position:fixed;left:12px;right:12px;bottom:86px;width:auto}}
`;
export function LibraryPicker({ sessionId, management, openLibrary, addReference }: Props) {
  const root = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [path, setPath] = React.useState<readonly LibraryTreeEntry[]>([]);
  const [rows, setRows] = React.useState<readonly LibraryTreeEntry[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const parentId = path.at(-1)?.id;
  React.useEffect(() => {
    const show = () => { setPath([]); setOpen(true); };
    window.addEventListener(libraryPickerRequestedEvent, show);
    return () => window.removeEventListener(libraryPickerRequestedEvent, show);
  }, []);
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(''); setRows([]);
    void management.list(parentId).then(items => { if (!cancelled) setRows(items); })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : '无法加载资料库，请重试。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, parentId, management]);
  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const pick = (row: LibraryTreeEntry) => {
    if (row.kind === 'folder') { setPath(current => [...current, row]); return; }
    if (addReference(String(sessionId), row)) setOpen(false);
    else setError('无法添加引用，请等待输入框就绪后重试。');
  };
  return <><style>{css}</style><div className="wd-library-picker" ref={root}>
    <button ref={trigger} type="button" className="wd-library-picker-trigger" aria-label="从资料库添加到对话" aria-haspopup="dialog" aria-expanded={open} title="从资料库添加到对话" onClick={() => { setPath([]); setOpen(value => !value); }}><Icon name="library" size={22} /></button>
    {open && <div className="wd-library-popover" role="dialog" aria-label="资料库">
      {parentId && <button className="wd-library-back" type="button" onClick={() => setPath(current => current.slice(0, -1))}>← 返回 · {path.at(-1)?.name}</button>}
      {loading && <div className="wd-library-status" role="status">正在加载资料…</div>}
      {error && <div className="wd-library-status" role="alert">{error}</div>}
      {!loading && !error && !rows.length && <div className="wd-library-status">暂无资料，可在资料库中导入文件。</div>}
      {rows.map(row => <div className="wd-library-row" key={row.id}>
        <button className="wd-library-main" type="button" onClick={() => pick(row)} disabled={row.kind !== 'folder' && (!row.asset || !row.revision)}><span className="wd-library-mark"><Icon name={row.kind === 'folder' ? 'folder' : 'library'} /></span><span className="wd-library-copy"><strong>{row.name}</strong><small>{row.kind === 'folder' ? '文件夹' : row.asset?.kind.toUpperCase()}</small></span></button>
        <button className="wd-library-action" type="button" aria-label={`${row.kind === 'folder' ? '打开' : '添加'} ${row.name}`} disabled={row.kind !== 'folder' && (!row.asset || !row.revision)} onClick={() => pick(row)}>{row.kind === 'folder' ? '打开' : '添加'}</button>
      </div>)}
      <button className="wd-library-manage" type="button" onClick={() => { setOpen(false); openLibrary(); }}><span aria-hidden="true">↗</span>管理资料库</button>
    </div>}
  </div></>;
}
