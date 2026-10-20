/** Spellings of one workspace path: Host, workspace-relative, prompt mention and resource address. */

export type PathKind = 'file' | 'directory';

const windowsDrive = /^[A-Za-z]:(?:[\\/]|$)/u;

function isWindowsStyle(path: string): boolean {
  return windowsDrive.test(path) || path.startsWith('\\\\');
}

function isAbsolute(path: string): boolean {
  return path.startsWith('/') || isWindowsStyle(path);
}

function trimTrailingSeparators(path: string): string {
  const trimmed = path.replace(/[\\/]+$/u, '');
  return trimmed === '' || /^[A-Za-z]:$/u.test(trimmed) ? path : trimmed;
}

/** Host filesystem spelling: Windows paths use backslashes throughout, others are kept. */
export function toHostPath(path: string): string {
  if (!isWindowsStyle(path)) return path;
  const unc = path.startsWith('\\\\') || path.startsWith('//');
  const body = path.replace(/[\\/]+/gu, '\\');
  return unc ? `\\${body}` : body;
}

/** Absolute Host path for an absolute or workspace-relative path; `undefined` when a relative path has no workspace root. */
export function resolveInWorkspace(cwd: string | undefined, path: string): string | undefined {
  const cleaned = trimTrailingSeparators(path);
  if (isAbsolute(cleaned)) return toHostPath(cleaned);
  if (cwd === undefined || cwd === '') return undefined;
  const relative = cleaned.replace(/^(?:\.[\\/])+/u, '').replace(/^[\\/]+/u, '');
  const root = trimTrailingSeparators(cwd);
  return toHostPath(relative === '' || relative === '.' ? root : `${root}/${relative}`);
}

/** `/`-separated path relative to the workspace root; `undefined` outside it or without a root. */
export function relativeToWorkspace(cwd: string | undefined, hostPath: string): string | undefined {
  if (cwd === undefined || cwd === '') return undefined;
  const windows = isWindowsStyle(cwd);
  const normalize = (value: string) => trimTrailingSeparators(value.replace(/\\/gu, '/'));
  const fold = (value: string) => windows ? value.toLowerCase() : value;
  const root = normalize(cwd);
  const path = normalize(hostPath);
  if (fold(path) === fold(root)) return '.';
  return fold(path).startsWith(`${fold(root)}/`) ? path.slice(root.length + 1) : undefined;
}

/**
 * Prompt text that references a path, in the `@path` / `@"path with spaces"` grammar the composer
 * understands; a directory ends with `/`. `undefined` when the grammar cannot represent the path.
 */
export function promptMention(cwd: string | undefined, hostPath: string, kind: PathKind): string | undefined {
  const target = relativeToWorkspace(cwd, hostPath) ?? hostPath.replace(/\\/gu, '/');
  const path = kind === 'directory' && target !== '.' ? `${target}/` : target;
  if (/[\u0000-\u001f\u007f-\u009f"]/u.test(path)) return undefined;
  return /\s/u.test(path) ? `@"${path}"` : `@${path}`;
}

/** Path carried by a rendered `@` reference or file link; a trailing `/` marks a directory. */
export function parseReferencePath(label: string): { path: string; directory: boolean } | undefined {
  const quoted = /^@"(.*)"?$/u.exec(label);
  const raw = quoted?.[1] ?? (label.startsWith('@') ? label.slice(1) : label);
  const path = raw.replace(/"$/u, '');
  if (path === '') return undefined;
  return { path, directory: /[\\/]$/u.test(path) };
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/giu, ':');
}

/** `dsh-resource://file/session/…` address the right sidebar opens; mirrors the DSH file address grammar. */
export function sessionFileAddress(sessionId: string, path: string): string {
  const normalized = path.replace(/\\/gu, '/').replace(/^(?:\.\/)+/u, '');
  return `dsh-resource://file/session/${encodeSegment(sessionId)}/${normalized.split('/').map(encodeSegment).join('/')}`;
}
