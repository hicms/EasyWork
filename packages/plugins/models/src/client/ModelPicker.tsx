import * as React from 'react';
import { createPortal } from 'react-dom';
import type { ModelsClient } from './management.ts';
import type { SessionModels } from './selection.ts';
import { selectedControls } from '../catalog.ts';
import { providerId } from '../shared.ts';
import { filterModels, ModelList } from './ModelList.tsx';
import { styles } from './styles.ts';
import { Icon, VendorIcon } from './Icons.tsx';
import { placeMenu } from './menu-position.ts';
import { ReasoningControls } from './ReasoningControls.tsx';

export function ModelPicker({ account, selection, locked, openAccount }: {
  account: ModelsClient; selection: SessionModels; locked: boolean; openAccount: () => void;
}) {
  const state = React.useSyncExternalStore(account.subscribe, account.getSnapshot, account.getSnapshot);
  const selected = React.useSyncExternalStore(selection.subscribe, selection.getSnapshot, selection.getSnapshot);
  const [open, setOpen] = React.useState(false); const [search, setSearch] = React.useState('');
  const root = React.useRef<HTMLDivElement>(null); const trigger = React.useRef<HTMLButtonElement>(null);
  const menu = React.useRef<HTMLDivElement>(null); const menuId = React.useId();
  const models = state.snapshot.models;
  const current = selected.current?.provider === providerId ? models.find(model => model.id === selected.current?.model) : undefined;
  React.useEffect(() => { void selection.load(); }, [selection]);
  React.useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const floating = menu.current; const anchor = trigger.current;
    const position = () => placeMenu(floating, anchor);
    position(); floating.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position); observer.observe(floating); observer.observe(anchor);
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position); window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position); window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [open]);
  React.useEffect(() => {
    if (!open) return;
    void selection.load();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open, selection]);
  React.useEffect(() => { if (locked) setOpen(false); }, [locked]);
  let values = current ? Object.fromEntries((current.reasoningControls ?? []).map(control => [control.path, control.default])) : {};
  if (current) { try { values = selectedControls(current, selected.current?.reasoningEffort); } catch { /* A removed server control remains visible as an unavailable saved selection. */ } }
  const select = (model: typeof models[number]) => { void selection.select(model).then(() => { setOpen(false); trigger.current?.focus(); }).catch(() => {}); };
  const keyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || (event.target instanceof Element && event.target.closest('.ew-reasoning-options'))) return;
    if (event.target instanceof HTMLInputElement && ['Home', 'End'].includes(event.key)) return;
    const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role=option]:not(:disabled)') ?? []);
    if (!items.length) return; event.preventDefault(); const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index < 0 ? event.key === 'ArrowUp' ? items.length - 1 : 0 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[next].focus({ preventScroll: true }); items[next].scrollIntoView({ block: 'nearest' });
  };
  const blur = (event: React.FocusEvent) => {
    if (event.relatedTarget instanceof Node && !root.current?.contains(event.relatedTarget) && !menu.current?.contains(event.relatedTarget)) setOpen(false);
  };
  return <div className="easywork-models ew-model-picker" ref={root} onBlur={blur}><style>{styles}</style>
    <button className="ew-trigger" type="button" ref={trigger} disabled={locked || selected.busy} aria-haspopup="dialog" aria-expanded={open}
      aria-controls={open ? menuId : undefined} title={current?.name ?? selected.current?.model ?? '选择模型'}
      aria-label={`模型：${current?.name ?? selected.current?.model ?? '未选择'}`} onClick={() => { setSearch(''); setOpen(value => !value); }}>
      <VendorIcon vendor={current?.vendor} /><span className="ew-trigger-text">{selected.busy ? '切换中…' : current?.name ?? selected.current?.model ?? '选择模型'}</span><Icon name="chevron" />
    </button>
    {open ? createPortal(<div className="easywork-models ew-model-menu" ref={menu} id={menuId} role="dialog" aria-label="选择 EasyWork 模型" onKeyDown={keyboard} onBlur={blur}>
      {!state.snapshot.user ? <><p>请先登录 EasyWork 模型服务。</p><button className="ew-button" type="button" onClick={() => { setOpen(false); openAccount(); }}>登录账号</button></>
        : <><div className="ew-menu-search"><Icon name="search" /><input type="search" aria-label="搜索模型" placeholder="搜索模型或厂商" value={search} onChange={event => setSearch(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { const model = filterModels(models, search)[0]; if (model) { event.preventDefault(); select(model); } } }} />
          <button type="button" className="ew-icon-button" aria-label="关闭模型选择" onClick={() => { setOpen(false); trigger.current?.focus(); }}><Icon name="close" /></button></div>
          <ModelList models={models} search={search} selected={current?.id} onSelect={select} disabled={selected.busy} />
          {current?.reasoningControls?.length ? <details className="ew-reasoning"><summary><Icon name="brain" />思考设置<Icon name="chevron" /></summary>
            <ReasoningControls controls={current.reasoningControls} values={values} disabled={selected.busy}
              onChange={(path, value) => { void selection.changeControl(current, path, value).catch(() => {}); }} />
          </details> : null}
          <div className="ew-menu-footer"><span>{models.length} 个模型</span><button className="ew-refresh" type="button" disabled={state.busy} onClick={() => { void account.refresh(true).then(() => selection.load()).catch(() => {}); }}><Icon name="refresh" />{state.busy ? '刷新中…' : '刷新模型'}</button></div>
        </>}
      {(selected.error ?? state.error ?? state.snapshot.error) ? <p className="ew-error" role="alert">{selected.error ?? state.error ?? state.snapshot.error}</p> : null}
    </div>, document.body) : null}
  </div>;
}
