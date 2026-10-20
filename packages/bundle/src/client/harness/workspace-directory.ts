export function isWorkspaceRoot(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\/\/\?\/UNC\//i, '//').replace(/^\/\/\?\//, '');
  const root = normalized.match(/^[a-z]:\//i)?.[0]
    ?? normalized.match(/^\/\/[^/]+\/[^/]+(?:\/|$)/)?.[0]
    ?? (normalized.startsWith('/') ? '/' : undefined);
  if (!root) return /^[a-z]:$/i.test(normalized);
  const segments: string[] = [];
  for (const segment of normalized.slice(root.length).split('/')) {
    if (segment === '..') segments.pop();
    else if (segment && segment !== '.') segments.push(segment);
  }
  return segments.length === 0;
}

export function assertWorkspaceDirectory(path: string, english: boolean): void {
  if (!isWorkspaceRoot(path)) return;
  throw new Error(english
    ? `“${path}” is a drive or filesystem root. Choose or create a writable subfolder, then add it as a workspace in the sidebar. Existing conversations and files are kept.`
    : `“${path}”是磁盘或文件系统根目录。请选择或创建一个可写的子文件夹，再通过侧栏添加为工作区。已有会话和文件会保留。`);
}

export function sessionCreationMessage(error: unknown, path: string, english: boolean): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!/failed to ensure project directory|\b(?:EPERM|EACCES|ENOENT|ENOTDIR|EROFS|ENOSPC)\b/.test(message)) return message;
  const advice = english
    ? `The workspace folder “${path}” is unavailable. Check that its drive is connected, the folder is writable and there is free space, or add a different folder as a workspace in the sidebar. Existing conversations and files are kept.`
    : `工作区目录“${path}”暂时不可用。请检查磁盘是否连接、文件夹是否可写、空间是否充足，或通过侧栏添加其他文件夹作为工作区。已有会话和文件会保留。`;
  return `${advice}\n${message}`;
}
