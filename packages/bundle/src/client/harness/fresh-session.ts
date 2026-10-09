import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';

/** A New Session is distinct from reopening an unsent draft or switching experts. */
export function installFreshSessionNavigation(ctx: Context): void {
  ctx.inject(['uiWorkspace', 'workspaces', 'sessions'], scope => scope.effect(() => {
    const owner = scope.uiWorkspace;
    const original = owner.startSession;
    const sessions = scope.sessions as unknown as ISessions;
    let disposed = false;
    const start: typeof original = workspaceId => {
      const current = Object.values(sessions.list.getSnapshot().byId).find(row => (row.retainedBy.mainView ?? 0) > 0);
      const workspaces = scope.workspaces.list.getSnapshot().items;
      const workspace = workspaceId ? workspaces.find(row => row.workspaceId === workspaceId)
        : workspaces.find(row => current && row.sessionIds.includes(current.id)) ?? workspaces[0];
      if (!workspace) { original.call(owner, workspaceId); return; }
      const navigation = scope.layout.beginNavigation();
      // No sessionId: the official controller must allocate a new, unbound Session.
      void sessions.create({ workspaceId: workspace.workspaceId }).then(id => {
        if (!disposed && !navigation.aborted) owner.openSession(id);
      }).catch(error => { if (!disposed && !navigation.aborted) console.error('无法新建会话', error); });
    };
    owner.startSession = start;
    return () => { disposed = true; if (owner.startSession === start) owner.startSession = original; };
  }, 'workdsh.fresh-session-navigation'));
}
