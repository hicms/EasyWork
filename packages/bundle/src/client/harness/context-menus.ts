import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import { ContextMenus, type ContextMenusProps, type ContextMenuRequest } from '../components/ContextMenus.js';
import { copyText, createFileMenuHost } from '../file-menu/actions.js';
import { resolveFileTarget } from '../file-menu/target.js';
import { createLinkMenuHost } from '../link-menu/actions.js';
import { resolveLinkTarget } from '../link-menu/target.js';

/** The registered page type of the side panel browser. */
const sidebarBrowserKind = 'browser';

/** The point a menu opens at: the pointer, or the target itself when the keyboard asked for it. */
function menuPoint(event: MouseEvent, element: Element): { x: number; y: number } {
  if (event.clientX !== 0 || event.clientY !== 0) return { x: event.clientX, y: event.clientY };
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.bottom };
}

/** A right-click inside selected text keeps the native Copy menu. */
function insideSelection(element: Element): boolean {
  const selection = document.getSelection();
  return selection !== null && !selection.isCollapsed && selection.containsNode(element, true);
}

/**
 * Right-click menus for files and directories (Files tree, sent `@` references, assistant file links)
 * and for web links in conversations. Everything else, including editable text, keeps the native menu.
 */
export function installContextMenus(ctx: Context): void {
  ctx.inject(['remote.session', 'sessions', 'sidebarRight', 'sidebarRightTabs', 'conversation', 'slots'], scope => scope.effect(() => {
    const sessions = scope.sessions as unknown as ISessions;
    const files = createFileMenuHost({
      session: scope.remote.session,
      openResource: address => { scope.sidebarRight.openResource(address); },
      insertReference: (sessionId, { mention, label, kind }) => {
        const binding = sessions.binding(sessionId as never);
        if (binding === undefined) return false;
        const state = scope.conversation.input.for(binding.ctx).state.getSnapshot();
        const end = state.draft.length;
        return binding.ctx.bail(binding.ctx, 'slash/input-insert-reference', {
          reference: { source: 'reference', ref: mention, label, appearance: kind === 'directory' ? 'folder' : 'file', clipboardText: mention },
          span: { start: end, end, draftRev: state.draftRev },
        }) === true;
      },
      writeClipboard: copyText,
    });
    const links = createLinkMenuHost({
      sidebarBrowserAvailable: () => scope.sidebarRightTabs.get(sidebarBrowserKind) !== undefined,
      // The official link click opens the browser page type the same way.
      openInSidebarBrowser: url => { scope.sidebarRight.openTab(sidebarBrowserKind, { params: { url } } as never); },
      openInBrowser: url => { window.open(url, '_blank', 'noopener,noreferrer'); },
      writeClipboard: copyText,
    });
    let request: ContextMenuRequest | null = null;
    const listeners = new Set<() => void>();
    const show = (next: ContextMenuRequest | null) => {
      request = next;
      for (const listener of listeners) listener();
    };
    const props: ContextMenusProps = {
      source: {
        getSnapshot: () => request,
        subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      },
      files,
      links,
      close: () => { show(null); },
    };
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element) || insideSelection(event.target)) return;
      const file = resolveFileTarget(event.target, id => sessions.list.getSnapshot().byId[id as never]?.cwd);
      const link = file === null ? resolveLinkTarget(event.target) : null;
      const subject: ContextMenuRequest['subject'] | null = file !== null ? { type: 'file', target: file } : link !== null ? { type: 'link', target: link } : null;
      if (subject === null) return;
      event.preventDefault();
      show({ subject, point: menuPoint(event, event.target) });
    };
    // Capture phase: the official surfaces never see a right-click this menu owns.
    document.addEventListener('contextmenu', onContextMenu, true);
    const unregister = scope.slots.inject('shell.overlay', () => scope.slots.register({
      name: 'shell.overlay', id: 'easywork-context-menus', inject: () => props,
    }, ContextMenus));
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
      unregister();
      listeners.clear();
    };
  }, 'easywork.context-menus'));
}
