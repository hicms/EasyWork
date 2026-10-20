import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import { SessionCreationNotice, type SessionCreationNoticeProps } from '../components/SessionCreationNotice.js';
import { assertWorkspaceDirectory, sessionCreationMessage } from './workspace-directory.js';

/** A New Session is distinct from reopening an unsent draft or switching experts. */
export function installFreshSessionNavigation(ctx: Context): void {
  ctx.inject(['uiWorkspace', 'workspaces', 'sessions'], scope => scope.effect(() => {
    const owner = scope.uiWorkspace;
    const original = owner.startSession;
    const sessions = scope.sessions as unknown as ISessions;
    const workspaces = scope.workspaces;
    const originalCreateSession = sessions.create;
    const originalCreateWorkspace = workspaces.create;
    const english = () => document.documentElement.lang.startsWith('en');
    let message: string | null = null;
    const listeners = new Set<() => void>();
    const notify = (next: string | null) => {
      message = next;
      for (const listener of listeners) listener();
    };
    const notice: SessionCreationNoticeProps = {
      source: {
        getSnapshot: () => message,
        subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
      },
      dismiss: () => notify(null),
    };
    const unregisterNotice = scope.slots.inject('shell.overlay', () => scope.slots.register({
      name: 'shell.overlay', id: 'easywork-session-creation-error', inject: () => notice,
    }, SessionCreationNotice));
    const createWorkspace: typeof originalCreateWorkspace = async input => {
      assertWorkspaceDirectory(input.path, english());
      return originalCreateWorkspace.call(workspaces, input);
    };
    const createSession: typeof originalCreateSession = async input => {
      const path = input?.workspaceId
        ? workspaces.list.getSnapshot().items.find(row => row.workspaceId === input.workspaceId)?.path
        : input?.cwd;
      const existing = input?.sessionId && sessions.list.getSnapshot().byId[input.sessionId];
      if (path && !existing) assertWorkspaceDirectory(path, english());
      return originalCreateSession.call(sessions, input);
    };
    workspaces.create = createWorkspace;
    sessions.create = createSession;
    let disposed = false;
    const start: typeof original = workspaceId => {
      notify(null);
      const current = Object.values(sessions.list.getSnapshot().byId).find(row => (row.retainedBy.mainView ?? 0) > 0);
      const workspaces = scope.workspaces.list.getSnapshot().items;
      const workspace = workspaceId ? workspaces.find(row => row.workspaceId === workspaceId)
        : workspaces.find(row => current && row.sessionIds.includes(current.id)) ?? workspaces[0];
      if (!workspace) { original.call(owner, workspaceId); return; }
      const navigation = scope.layout.beginNavigation();
      // No sessionId: the official controller must allocate a new, unbound Session.
      void sessions.create({ workspaceId: workspace.workspaceId }).then(id => {
        if (!disposed && !navigation.aborted) owner.openSession(id);
      }).catch(error => {
        if (!disposed && !navigation.aborted) {
          console.error('无法新建会话', error);
          notify(sessionCreationMessage(error, workspace.path, english()));
        }
      });
    };
    owner.startSession = start;
    return () => {
      disposed = true;
      if (owner.startSession === start) owner.startSession = original;
      if (sessions.create === createSession) sessions.create = originalCreateSession;
      if (workspaces.create === createWorkspace) workspaces.create = originalCreateWorkspace;
      unregisterNotice();
      listeners.clear();
    };
  }, 'easywork.fresh-session-navigation'));
}
