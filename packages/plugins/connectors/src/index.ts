import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-credentials';
import type {} from '@deepseek-ai/dsh-mcp-resources';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-storage-domain';
import { registerConnectorManagementConnection } from './connection-api.js';
import { ConnectorManager, type ConnectorManagerOptions } from './manager.js';

export * from './shared.js';
export * from './connection-api.js';
export * from './manager.js';
export const name = 'workdsh-plugin-connectors';
export const inject = ['connection', 'tools', 'mcpResources', 'storageDomain', 'agents', 'credentials', 'workdshSessionAccess'];

export async function apply(ctx: Context, options: ConnectorManagerOptions = {}): Promise<void> {
  await ctx.plugin(ConnectorManager, options);
  await ctx.plugin({
    name: 'workdsh-connectors-integration',
    inject: [...inject, 'workdshConnectors'],
    apply: registerConnectorManagementConnection,
  });
}
