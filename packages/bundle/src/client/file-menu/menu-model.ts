import { promptMention, relativeToWorkspace } from './path-forms.js';
import type { FileTarget } from './target.js';

export interface FileApplication {
  readonly id: string;
  readonly name: string;
}

/** What the Host and the target allow beyond copying. */
export interface FileMenuCapabilities {
  /** The Host can hand paths to a native desktop. */
  readonly desktop: boolean;
  /** Registered handlers of the target file; empty until read or when none are registered. */
  readonly applications: readonly FileApplication[];
}

export type FileCommand =
  | { readonly type: 'preview' | 'open' | 'reveal' | 'copy-path' | 'copy-relative-path' | 'insert-reference' }
  | { readonly type: 'open-with'; readonly application: string };

export interface FileMenuItem {
  readonly id: string;
  readonly label: string;
  readonly submenu?: readonly FileMenuItem[];
}

export type FileMenuEntry = FileMenuItem | { readonly type: 'separator'; readonly id: string };

const openWithPrefix = 'open-with:';

const labels = {
  zh: {
    preview: '在右侧栏预览', open: '打开', openFolder: '在文件管理器中打开', openWith: '打开方式',
    reveal: '在文件管理器中显示', copyPath: '复制路径', copyRelativePath: '复制相对路径', insertReference: '添加到对话',
    failed: {
      preview: '无法预览该文件', open: '无法在本机打开该路径', 'open-with': '无法在本机打开该路径', reveal: '无法在本机打开该路径',
      'copy-path': '无法复制到剪贴板', 'copy-relative-path': '无法复制到剪贴板', 'insert-reference': '无法添加到对话，请先打开该会话',
    },
  },
  en: {
    preview: 'Preview in side panel', open: 'Open', openFolder: 'Open in file manager', openWith: 'Open with',
    reveal: 'Reveal in file manager', copyPath: 'Copy path', copyRelativePath: 'Copy relative path', insertReference: 'Add to chat',
    failed: {
      preview: 'Unable to preview this file', open: 'Unable to open this path on this computer', 'open-with': 'Unable to open this path on this computer',
      reveal: 'Unable to open this path on this computer', 'copy-path': 'Unable to copy to the clipboard',
      'copy-relative-path': 'Unable to copy to the clipboard', 'insert-reference': 'Unable to add to the chat; open the session first',
    },
  },
} as const;

export function failureMessage(command: FileCommand, english: boolean): string {
  return labels[english ? 'en' : 'zh'].failed[command.type];
}

export function parseCommand(id: string): FileCommand | undefined {
  if (id.startsWith(openWithPrefix)) return { type: 'open-with', application: id.slice(openWithPrefix.length) };
  switch (id) {
    case 'preview': case 'open': case 'reveal': case 'copy-path': case 'copy-relative-path': case 'insert-reference': return { type: id };
    default: return undefined;
  }
}

/** Menu rows for one target: file and directory differ, `other` can only be copied. */
export function buildFileMenu(target: FileTarget, capabilities: FileMenuCapabilities, english: boolean): FileMenuEntry[] {
  const text = labels[english ? 'en' : 'zh'];
  const open: FileMenuItem[] = [];
  if (target.kind === 'file') open.push({ id: 'preview', label: text.preview });
  if (capabilities.desktop && target.kind === 'file') open.push({ id: 'open', label: text.open });
  if (capabilities.desktop && target.kind === 'file' && capabilities.applications.length > 0) {
    open.push({ id: 'open-with', label: text.openWith, submenu: capabilities.applications.map(app => ({ id: `${openWithPrefix}${app.id}`, label: app.name })) });
  }
  if (capabilities.desktop && target.kind === 'file') open.push({ id: 'reveal', label: text.reveal });
  if (capabilities.desktop && target.kind === 'directory') open.push({ id: 'open', label: text.openFolder });

  const copy: FileMenuItem[] = [{ id: 'copy-path', label: text.copyPath }];
  if (relativeToWorkspace(target.cwd, target.path) !== undefined) copy.push({ id: 'copy-relative-path', label: text.copyRelativePath });

  const chat: FileMenuItem[] = target.kind !== 'other' && promptMention(target.cwd, target.path, target.kind) !== undefined
    ? [{ id: 'insert-reference', label: text.insertReference }] : [];

  return [open, copy, chat].filter(group => group.length > 0).flatMap((group, index) =>
    index === 0 ? group : [{ type: 'separator' as const, id: `separator-${String(index)}` }, ...group]);
}
