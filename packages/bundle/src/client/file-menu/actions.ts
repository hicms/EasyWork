import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client';
import type { FileApplication, FileCommand } from './menu-model.js';
import { promptMention, relativeToWorkspace, sessionFileAddress, type PathKind } from './path-forms.js';
import type { FileTarget } from './target.js';

/** The slice of the Session Remote the menu calls. */
export interface FileMenuSessionRemote {
  canOpenWorkspacePath(): Promise<RemoteResult<boolean>>;
  openWorkspacePath(request: { path: string; action?: 'reveal'; application?: string }, signal?: AbortSignal): Promise<RemoteResult<unknown>>;
  workspacePathApplications(request: { path: string }, signal?: AbortSignal): Promise<RemoteResult<readonly { id: string; name: string }[]>>;
}

export interface FileMenuDeps {
  readonly session: FileMenuSessionRemote;
  /** Open a `dsh-resource://` address in the right sidebar of the current session. */
  openResource(address: string): void;
  /** Put a reference into the session's composer; `false` when that session is not mounted. */
  insertReference(sessionId: string, reference: { mention: string; label: string; kind: PathKind }): boolean;
  writeClipboard(text: string): Promise<void>;
}

/** Effects behind the menu; every failure rejects so the caller can announce it. */
export interface FileMenuHost {
  desktop(): Promise<boolean>;
  applications(path: string, signal: AbortSignal): Promise<readonly FileApplication[]>;
  run(command: FileCommand, target: FileTarget): Promise<void>;
}

function settle<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

function basename(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}

/** Copy through the async Clipboard API; fall back to a selection copy where it is unavailable (insecure origins). */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard !== undefined) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch { /* Permission or secure-context refusal: try the selection copy below. */ }
  }
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  const focused = document.activeElement;
  document.body.append(field);
  try {
    field.select();
    if (!document.execCommand('copy')) throw new Error('clipboard unavailable');
  } finally {
    field.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  }
}

export function createFileMenuHost(deps: FileMenuDeps): FileMenuHost {
  let desktop: boolean | undefined;
  return {
    async desktop() {
      if (desktop !== undefined) return desktop;
      try {
        const answer = await deps.session.canOpenWorkspacePath();
        if (!answer.ok) return false;
        desktop = answer.value;
        return desktop;
      } catch { return false; }
    },
    async applications(path, signal) {
      const answer = await deps.session.workspacePathApplications({ path }, signal);
      return answer.ok ? answer.value.map(app => ({ id: app.id, name: app.name })) : [];
    },
    async run(command, target) {
      const { path, cwd, sessionId } = target;
      const relative = relativeToWorkspace(cwd, path);
      switch (command.type) {
        case 'preview':
          deps.openResource(sessionFileAddress(sessionId, relative ?? path));
          return;
        case 'open': settle(await deps.session.openWorkspacePath({ path })); return;
        case 'open-with': settle(await deps.session.openWorkspacePath({ path, application: command.application })); return;
        case 'reveal': settle(await deps.session.openWorkspacePath({ path, action: 'reveal' })); return;
        case 'copy-path': await deps.writeClipboard(path); return;
        case 'copy-relative-path':
          if (relative === undefined) throw new Error('path is outside the workspace');
          await deps.writeClipboard(relative);
          return;
        case 'insert-reference': {
          if (target.kind === 'other') throw new Error('entry cannot be referenced');
          const mention = promptMention(cwd, path, target.kind);
          if (mention === undefined) throw new Error('path cannot be referenced');
          const label = target.kind === 'directory' ? `${basename(path)}/` : basename(path);
          if (!deps.insertReference(sessionId, { mention, label, kind: target.kind })) throw new Error('session is not mounted');
        }
      }
    },
  };
}
