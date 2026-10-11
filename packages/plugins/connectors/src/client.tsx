import type { ComposerHandoff, ComposerHandoffSource } from 'easywork-contracts/composer';
declare module '@deepseek-ai/cordis' { interface Events { 'easywork/composer-handoff'(handoff: ComposerHandoff): Promise<void>; } }
import type { Context } from '@deepseek-ai/cordis';
import * as React from 'react';
import { Icon } from 'easywork-ui';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import { ConnectorsPanel } from './client/ConnectorsPanel.js';
import { ConnectorPicker } from './client/ConnectorPicker.js';
import { createConnectorManagementClient } from './client/management.js';

export const name = 'easywork-connectors-client';
export const inject = ['slots', 'layout', 'connection'];

export function apply(ctx: Context): void {
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort(), 'easywork.connectors.client');
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: 'easywork-connectors', label: '连接器', order: 32,
  }, ConnectorNavigationIcon));
  const management = createConnectorManagementClient(ctx, lifetime.signal);
  ctx.on('easywork/composer-handoff', async handoff => {
    const selected = await management.selection(handoff.sourceSessionId);
    await management.setSelection(handoff.targetSessionId, selected);
  });
  const openCapability = (key: string) => ctx.layout.selectPanel(key as Parameters<typeof ctx.layout.selectPanel>[0]);
  const hasCapability = (key: string) => ctx.slots.entriesOfSlot('main').some(entry => entry.options.key === key);
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: 'easywork-connectors',
    inject: () => ({ toggleNavigation: () => ctx.layout.toggleSidebar(), management, openCapability, hasCapability }),
  }, ConnectorsPanel));
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'easywork-connectors-picker', order: 30,
    inject: () => ({ management, openManagement: () => openCapability('easywork-connectors') }),
  }, ConnectorPicker));
}

function ConnectorNavigationIcon() { return <Icon name="connectors" />; }
