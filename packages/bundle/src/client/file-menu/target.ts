import { parseReferencePath, resolveInWorkspace } from './path-forms.js';

/**
 * A file-like thing under the pointer. `other` is a tree entry that is neither a file nor a
 * directory (socket, device); it can only be copied.
 */
export interface FileTarget {
  readonly kind: 'file' | 'directory' | 'other';
  /** Absolute path in Host spelling. */
  readonly path: string;
  readonly sessionId: string;
  /** Session workspace root, when known. */
  readonly cwd: string | undefined;
}

export type WorkspaceRootOf = (sessionId: string) => string | undefined;

const editable = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

export function isEditable(element: Element): boolean {
  return element.closest(editable) !== null;
}

/** CSS-module class tokens are `hash_name` in DSH client modules and `_name_hash_line` in the Web frontend. */
function hasModuleClass(element: Element, name: string): boolean {
  const local = new RegExp(`(?:^|_)${name}(?:_|$)`, 'u');
  return Array.from(element.classList).some(token => local.test(token));
}

function treeTarget(element: Element, rootOf: WorkspaceRootOf): FileTarget | null | undefined {
  const row = element.closest<HTMLElement>('li[data-files-entry]');
  if (row === null) return undefined;
  // A directory row also holds its children; only the row's own control counts.
  if (row.firstElementChild?.contains(element) !== true) return null;
  const sessionId = row.closest<HTMLElement>('[data-sidebar-right-session]')?.dataset.sidebarRightSession;
  const entry = row.dataset.filesEntry;
  const path = row.dataset.filesPath;
  if (sessionId === undefined || path === undefined || (entry !== 'file' && entry !== 'directory' && entry !== 'other')) return null;
  const root = row.closest<HTMLElement>('[data-files-root]')?.dataset.filesRoot;
  const cwd = rootOf(sessionId) ?? root;
  const resolved = resolveInWorkspace(cwd, path);
  return resolved === undefined ? null : { kind: entry, path: resolved, sessionId, cwd };
}

function referenceTarget(element: Element, rootOf: WorkspaceRootOf): FileTarget | null | undefined {
  const chip = element.closest<HTMLElement>('[data-ref-chip="file"], [data-ref-chip="folder"]');
  const link = chip === null ? element.closest('button') : null;
  const carrier = chip ?? (link !== null && hasModuleClass(link, 'fileMention') && hasModuleClass(link, 'fileLink') ? link : null);
  if (carrier === null) return undefined;
  const sessionId = carrier.closest<HTMLElement>('[data-conversation-session]')?.dataset.conversationSession;
  const reference = parseReferencePath(carrier.getAttribute('title') ?? '');
  if (sessionId === undefined || reference === undefined) return null;
  const cwd = rootOf(sessionId);
  const path = resolveInWorkspace(cwd, reference.path);
  if (path === undefined) return null;
  const kind = chip !== null ? (chip.dataset.refChip === 'folder' ? 'directory' : 'file') : reference.directory ? 'directory' : 'file';
  return { kind, path, sessionId, cwd };
}

/**
 * Resolve the context-menu target under `element`, or `null` to leave the native menu alone.
 * Reads only DSH markers that the contract test pins.
 */
export function resolveFileTarget(element: Element, rootOf: WorkspaceRootOf): FileTarget | null {
  if (isEditable(element)) return null;
  // `null` from a resolver means "recognized, but not actionable"; only `undefined` falls through.
  const tree = treeTarget(element, rootOf);
  if (tree !== undefined) return tree;
  return referenceTarget(element, rootOf) ?? null;
}
