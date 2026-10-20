import type { FileMenuEntry } from '../file-menu/menu-model.js';

export type LinkCommand = 'open-sidebar' | 'open-browser' | 'copy-link';

const labels = {
  zh: {
    openSidebar: '在侧栏浏览器中打开', openBrowser: '在浏览器中打开', copyLink: '复制链接地址',
    failed: { 'open-sidebar': '无法在侧栏浏览器中打开链接', 'open-browser': '无法打开链接', 'copy-link': '无法复制到剪贴板' },
  },
  en: {
    openSidebar: 'Open in side panel browser', openBrowser: 'Open in browser', copyLink: 'Copy link address',
    failed: { 'open-sidebar': 'Unable to open the link in the side panel browser', 'open-browser': 'Unable to open the link', 'copy-link': 'Unable to copy to the clipboard' },
  },
} as const;

export function linkFailureMessage(command: LinkCommand, english: boolean): string {
  return labels[english ? 'en' : 'zh'].failed[command];
}

export function parseLinkCommand(id: string): LinkCommand | undefined {
  return id === 'open-sidebar' || id === 'open-browser' || id === 'copy-link' ? id : undefined;
}

/** Rows for one link; the side panel row exists only where the browser page type is registered. */
export function buildLinkMenu(sidebarBrowser: boolean, english: boolean): FileMenuEntry[] {
  const text = labels[english ? 'en' : 'zh'];
  return [
    ...sidebarBrowser ? [{ id: 'open-sidebar', label: text.openSidebar }] : [],
    { id: 'open-browser', label: text.openBrowser },
    { type: 'separator', id: 'separator-1' },
    { id: 'copy-link', label: text.copyLink },
  ];
}
