import type { LinkCommand } from './menu-model.js';
import type { LinkTarget } from './target.js';

export interface LinkMenuDeps {
  /** The side panel can show a browser page. */
  sidebarBrowserAvailable(): boolean;
  openInSidebarBrowser(url: string): void;
  openInBrowser(url: string): void;
  writeClipboard(text: string): Promise<void>;
}

/** Effects behind the link menu; every failure rejects so the caller can announce it. */
export interface LinkMenuHost {
  sidebarBrowserAvailable(): boolean;
  run(command: LinkCommand, target: LinkTarget): Promise<void>;
}

export function createLinkMenuHost(deps: LinkMenuDeps): LinkMenuHost {
  return {
    sidebarBrowserAvailable: deps.sidebarBrowserAvailable,
    // Opening runs before any await so that the menu click still counts as the user gesture a popup needs.
    async run(command, { url }) {
      switch (command) {
        case 'open-sidebar': deps.openInSidebarBrowser(url); return;
        case 'open-browser': deps.openInBrowser(url); return;
        case 'copy-link': await deps.writeClipboard(url);
      }
    },
  };
}
