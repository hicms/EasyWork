import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-storage-domain';
import type {} from '@deepseek-ai/dsh-client-connection';
import { ProjectManager } from './services/project-manager.js';
import { registerProjectConnection } from './remote/connection-api.js';
import { registerProjectContextInjection } from './runtime/context-injection.js';
import { registerDeliverableAttribution } from './runtime/deliverable-attribution.js';
export * from './services/project-manager.js'; export * from './storage/domain.js';
export const name='easywork-plugin-projects';
export const inject=['storageDomain','connection','easyworkIdentity'];
export interface ProjectOptions { readonly workspaceRoot?: string; }
export async function apply(ctx:Context,options:ProjectOptions={}){
  await ctx.plugin(ProjectManager);
  await ctx.plugin({
    name:'easywork-projects-integration',
    inject:[...inject,'systemPrompt','easyworkProjects','workspaceController'],
    apply(integration:Context){registerProjectConnection(integration,options.workspaceRoot);registerProjectContextInjection(integration);},
  });
  await ctx.plugin({
    name:'easywork-projects-attribution',
    inject:['fs','easyworkLibrary','easyworkProjects','easyworkIdentity'],
    apply(attribution:Context){registerDeliverableAttribution(attribution);},
  });
}
