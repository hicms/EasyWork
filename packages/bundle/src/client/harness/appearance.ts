import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-theme/client';
import { themeTokenOverrides } from 'easywork-ui';

/** The official presenter owns DOM writes, preference changes and native chrome. */
export function installAppearance(ctx: Context): void {
  ctx.inject(['theme'], scope => {
    scope.effect(() => scope.theme.overrideTokens('easywork-bundle', themeTokenOverrides), 'easywork.appearance');
  });
}
