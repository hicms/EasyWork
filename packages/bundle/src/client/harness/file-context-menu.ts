import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import { FileContextMenu, type FileContextMenuProps, type FileMenuRequest } from '../components/FileContextMenu.js';
import { copyText, createFileMenuHost } from '../file-menu/actions.js';
import { resolveFileTarget } from '../file-menu/target.js';

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
 * Right-click menu for files and directories shown in the Files tree, in sent `@` references and in
 * assistant file links. Everything else, including editable text, keeps the native menu.
 */
export function installFileContextMenu(ctx: Context): void {
  ctx.inject(['remote.session', 'sessions', 'sidebarRight', 'conversation', 'slots'], scope => scope.effect(() => {
    const sessions = scope.sessions as unknown as ISessions;
    const host = createFileMenuHost({
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
    let request: FileMenuRequest | null = null;
    const listeners = new Set<() => void>();
    const show = (next: FileMenuRequest | null) => {
      request = next;
      for (const listener of listeners) listener();
    };
    const props: FileContextMenuProps = {
      source: {
        getSnapshot: () => request,
        subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      },
      host,
      close: () => { show(null); },
    };
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element) || insideSelection(event.target)) return;
      const target = resolveFileTarget(event.target, id => sessions.list.getSnapshot().byId[id as never]?.cwd);
      if (target === null) return;
      event.preventDefault();
      show({ target, point: menuPoint(event, event.target) });
    };
    // Capture phase: the official surfaces never see a right-click this menu owns.
    document.addEventListener('contextmenu', onContextMenu, true);
    const unregister = scope.slots.inject('shell.overlay', () => scope.slots.register({
      name: 'shell.overlay', id: 'easywork-file-context-menu', inject: () => props,
    }, FileContextMenu));
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
      unregister();
      listeners.clear();
    };
  }, 'easywork.file-context-menu'));
}
