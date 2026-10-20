import * as React from 'react';
import { PointMenu } from 'easywork-ui';
import type { FileMenuHost } from '../file-menu/actions.js';
import { buildFileMenu, failureMessage, parseCommand, type FileApplication } from '../file-menu/menu-model.js';
import type { FileTarget } from '../file-menu/target.js';
import type { LinkMenuHost } from '../link-menu/actions.js';
import { buildLinkMenu, linkFailureMessage, parseLinkCommand } from '../link-menu/menu-model.js';
import type { LinkTarget } from '../link-menu/target.js';

export interface ContextMenuRequest {
  readonly subject: { readonly type: 'file'; readonly target: FileTarget } | { readonly type: 'link'; readonly target: LinkTarget };
  readonly point: { readonly x: number; readonly y: number };
}

export interface ContextMenusProps {
  source: {
    getSnapshot(): ContextMenuRequest | null;
    subscribe(listener: () => void): () => void;
  };
  files: FileMenuHost;
  links: LinkMenuHost;
  close(): void;
}

interface MenuProps<Target, Host> {
  target: Target;
  point: ContextMenuRequest['point'];
  host: Host;
  close(): void;
  announce(message: string): void;
}

const noticeDuration = 4000;

const isEnglish = () => document.documentElement.lang.startsWith('en');

function FileMenu({ target, point, host, close, announce }: MenuProps<FileTarget, FileMenuHost>) {
  const [desktop, setDesktop] = React.useState(false);
  const [applications, setApplications] = React.useState<readonly FileApplication[]>([]);
  React.useEffect(() => {
    const lifetime = new AbortController();
    void host.desktop().then(async available => {
      if (lifetime.signal.aborted) return;
      setDesktop(available);
      if (!available || target.kind !== 'file') return;
      const found = await host.applications(target.path, lifetime.signal);
      if (!lifetime.signal.aborted) setApplications(found);
    }).catch(error => { if (!lifetime.signal.aborted) console.error('无法读取文件的可用应用', error); });
    return () => lifetime.abort();
  }, [host, target]);
  const english = isEnglish();
  const items = React.useMemo(() => buildFileMenu(target, { desktop, applications }, english), [target, desktop, applications, english]);
  const select = (id: string) => {
    const command = parseCommand(id);
    if (command === undefined) return;
    close();
    host.run(command, target).catch(error => {
      console.error('文件菜单操作失败', command.type, error);
      announce(failureMessage(command, english));
    });
  };
  return <PointMenu point={point} items={items} onSelect={select} onClose={close} />;
}

function LinkMenu({ target, point, host, close, announce }: MenuProps<LinkTarget, LinkMenuHost>) {
  const english = isEnglish();
  const items = React.useMemo(() => buildLinkMenu(host.sidebarBrowserAvailable(), english), [host, english]);
  const select = (id: string) => {
    const command = parseLinkCommand(id);
    if (command === undefined) return;
    close();
    host.run(command, target).catch(error => {
      console.error('链接菜单操作失败', command, error);
      announce(linkFailureMessage(command, english));
    });
  };
  return <PointMenu point={point} items={items} onSelect={select} onClose={close} />;
}

export function ContextMenus({ source, files, links, close }: ContextMenusProps) {
  const request = React.useSyncExternalStore(source.subscribe, source.getSnapshot);
  const [notice, setNotice] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (notice === null) return undefined;
    const timer = window.setTimeout(() => setNotice(null), noticeDuration);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const key = request === null ? '' : `${String(request.point.x)}:${String(request.point.y)}:${request.subject.type}`;
  return <>
    {request?.subject.type === 'file' && <FileMenu key={`${key}:${request.subject.target.path}`} target={request.subject.target}
      point={request.point} host={files} close={close} announce={setNotice} />}
    {request?.subject.type === 'link' && <LinkMenu key={`${key}:${request.subject.target.url}`} target={request.subject.target}
      point={request.point} host={links} close={close} announce={setNotice} />}
    {notice !== null && <aside role="status" style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
      maxWidth: 'min(520px, calc(100vw - 32px))', boxSizing: 'border-box', padding: '10px 16px', borderRadius: 12,
      boxShadow: '0 6px 28px #0003', pointerEvents: 'none',
      background: 'var(--dsw-alias-bg-layer-1, #fff)', color: 'var(--dsw-alias-label-primary, #252a29)',
    }}>{notice}</aside>}
  </>;
}
