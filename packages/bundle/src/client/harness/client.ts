import { installAppearance } from './appearance.js';
import { installFreshSessionNavigation } from './fresh-session.js';
import { communityMarketView, type MarketHost } from '../components/CommunityMarket.js';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import * as workbench from 'easywork-plugin-workbench';
import { BrandMark, BrandName, DiagnosticsMark } from '../components/Brand.js';
import { DiagnosticsPanel, type Inventory } from '../components/DiagnosticsPanel.js';
import { NavigationLocation } from '../components/NavigationLocation.js';
import { AgentBrowserPage, agentBrowserKind, readAgentBrowserFrame } from '../components/AgentBrowserPage.js';

declare module '@deepseek-ai/cordis' {
  interface Context { market: MarketHost; }
}

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap { 'easywork-agent-browser': Record<string, never>; }
}

export const name = 'easywork-client';
export const inject = ['slots', 'layout', 'remote', 'remote.pluginInventory', 'sessions', 'sidebarRight', 'sidebarRightTabs'];

const productViews: Readonly<Record<string, string>> = {
  experts: 'easywork-experts', skills: 'easywork-skills', assistant: 'easywork-assistant', projects: 'easywork-projects', 'project-detail': 'easywork-project-detail',
  library: 'easywork-library', connectors: 'easywork-connectors', automation: 'easywork-automation', more: 'easywork-more',
};

export function apply(ctx: Context): void {
  installAppearance(ctx);
  installFreshSessionNavigation(ctx);
  ctx.inject(['market'], scope => {
    if (scope.market.version !== 1) return;
    scope.market.setSettingsVisible(false);
    scope.effect(() => () => scope.market.setSettingsVisible(true), 'easywork.community-market.settings-visibility');
    scope.slots.inject('plugins.item', () => scope.slots.register({
      name: 'plugins.item', id: 'easywork-community-market', order: -100,
      label: '发现社区插件',
    }, communityMarketView(scope.market)));
  });
  let legacyBrowserEnabled = false;
  ctx.effect(() => {
    let disposed = false;
    let unregister: (() => void) | undefined;
    const registerLegacy = () => {
      if (disposed || unregister) return;
      legacyBrowserEnabled = true;
      unregister = ctx.sidebarRightTabs.register({
        id: agentBrowserKind, kind: agentBrowserKind, title: () => '智能体浏览器',
        guide: [{ id: 'agent-browser', order: 25, title: () => '智能体浏览器', description: () => '查看并操作当前会话的网页' }],
      });
    };
    // The optional provider owns a different Session page. Read the official
    // inventory rather than making a request to a route that may not exist.
    void ctx.remote.pluginInventory.list().then(response => {
      if (disposed || !response.ok) return;
      const provider = response.value.entries.find(row => row.moduleName === 'easywork-provider-browser-session');
      if (!provider?.enabled) registerLegacy();
    }).catch(() => { /* Unknown inventory is not evidence that a provider is absent. */ });
    return () => { disposed = true; unregister?.(); };
  }, 'easywork.agent-browser.tab');
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: agentBrowserKind }, AgentBrowserPage));
  ctx.effect(() => {
    const sessions = ctx.sessions as unknown as ISessions;
    const opened = new Set<string>();
    let pending = false;
    const poll = async () => {
      if (pending || !legacyBrowserEnabled) return;
      const state = sessions.list.getSnapshot();
      const current = Object.values(state.byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id;
      if (!current || opened.has(String(current))) return;
      pending = true;
      try {
        const { frame } = await readAgentBrowserFrame(String(current));
        if (!frame || frame.revision === 0) return;
        opened.add(String(current));
        ctx.sidebarRight.openTabIn(current, agentBrowserKind, { params: {} });
      } catch { /* The browser provider is optional; retry on the next poll. */ }
      finally { pending = false; }
    };
    const timer = window.setInterval(() => { void poll(); }, 900);
    return () => window.clearInterval(timer);
  }, 'easywork.agent-browser.auto-open');
  const diagnostics = new URL(window.location.href).searchParams.get('diagnostics') === '1';
  const viewToPanel = diagnostics ? { ...productViews, diagnostics: 'easywork-probe' } : productViews;
  const panelToView = Object.fromEntries(Object.entries(viewToPanel).map(([view, panel]) => [panel, view]));
  const selectView = (view: string | null) => {
    const target = view === 'projects' && new URL(window.location.href).searchParams.has('project') ? 'project-detail' : view;
    const requested = target ? viewToPanel[target] : undefined;
    const selected = requested && ctx.slots.entriesOfSlot('main').some(entry => entry.options.key === requested)
      ? requested as Parameters<typeof ctx.layout.selectPanel>[0] : null;
    ctx.layout.selectPanel(selected);
    return selected;
  };

  // Appearance follows the official ThemeRuntime and the user's Settings and
  // system preference; the workbench must not pin a theme or veto theme/change.
  ctx.plugin(workbench);
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -10 }, BrandName));
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark', priority: -10 }, BrandMark));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'easywork-location', inject: () => ({ panelToView, selectView }),
  }, NavigationLocation));

  ctx.slots.inject('main', () => {
    const dispose = diagnostics ? ctx.slots.register({
      name: 'main', key: 'easywork-probe', inject: () => ({
        inspect: async (): Promise<Inventory> => {
          const response = await ctx.remote.pluginInventory.list();
          if (!response.ok) throw new Error(response.error.code);
          return { total: response.value.entries.length, modules: response.value.entries
            .filter(row => row.moduleName.startsWith('easywork-'))
            .map(row => ({ module: row.moduleName, phase: row.fiberPhase })) };
        },
        returnToConversation: () => ctx.layout.selectPanel(null),
      }),
    }, DiagnosticsPanel) : () => {};
    return dispose;
  });
  if (diagnostics) ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: 'easywork-probe', label: 'EasyWork 接入验证', order: 90,
  }, DiagnosticsMark));
}
