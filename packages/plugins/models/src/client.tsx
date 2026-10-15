import * as React from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type {} from '@deepseek-ai/dsh-client-ui-commands/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-connection/client';
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { ModelsClient } from './client/management.ts';
import { SessionModels } from './client/selection.ts';
import { AccountModels } from './client/AccountModels.tsx';
import { ModelPicker } from './client/ModelPicker.tsx';
import { tierLabels } from './shared.ts';
import { styles } from './client/styles.ts';

export const name = 'easywork-models-client';
export const inject = ['slots', 'sessions', 'remote', 'remote.session', 'commandUi'];
export function apply(ctx: Context): void {
  const lifetime = new AbortController(); const account = new ModelsClient(lifetime.signal);
  const sessions = ctx.sessions as unknown as ISessions;
  const selections = new Map<SessionId, SessionModels>();
  const selectionOf = (id: SessionId) => {
    let selection = selections.get(id);
    if (!selection) {
      const scope = sessions.scope(id); if (!scope) throw new Error('会话尚未就绪。');
      selection = new SessionModels(ctx, id, account, sessions); selections.set(id, selection);
      const owned = selection; scope.effect(() => () => { owned.dispose(); if (selections.get(id) === owned) selections.delete(id); }, 'easywork.models.session');
    }
    return selection;
  };
  const refresh = () => { void account.refresh().catch(() => {}); };
  ctx.effect(() => {
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 30_000);
    return () => { lifetime.abort(); window.clearInterval(timer); for (const selection of selections.values()) selection.dispose(); selections.clear(); };
  }, 'easywork.models.client');
  ctx.on('connection/reset', () => { account.reset(); for (const selection of selections.values()) selection.reset(); refresh(); });
  ctx.remote.$on('credentials/record-updated', refresh);
  ctx.remote.$on('llm/adapters-updated', refresh);
  refresh();
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'easywork-models', label: '账号与模型', order: -100, inject: () => ({ account }),
  }, AccountModels));
  let openAccount = () => {};
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({ name: 'settings.onboarding', id: 'easywork-models-account', order: -100 },
    (props: PropsRuntime<'settings.onboarding'>) => {
      React.useEffect(() => { if (props.explicit) props.openSection('easywork-models'); props.complete(); }, [props.explicit, props.openSection, props.complete]);
      return null;
    }));
  ctx.slots.inject('settings.launcher', () => ctx.slots.register({ name: 'settings.launcher', inject: () => ({ account }) },
    (props: PropsRuntime<'settings.launcher'> & { account: ModelsClient }) => {
      const state = React.useSyncExternalStore(account.subscribe, account.getSnapshot, account.getSnapshot);
      const open = () => { props.openOnboarding('easywork-models-account'); };
      React.useEffect(() => { openAccount = open; return () => { openAccount = () => {}; }; }, [props.openOnboarding]);
      return <><style>{styles}</style><button className="ew-model-launcher" type="button" onClick={open} title={state.snapshot.user?.email ?? '登录 EasyWork'}><span aria-hidden="true">◉</span>{props.wide ? <span>{state.snapshot.user?.email ?? '登录 EasyWork'}</span> : null}</button></>;
    }));
  ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
    name: 'conversation.input.model', inject: sessionId => ({ account, selection: selectionOf(sessionId), openAccount, available: sessions.subagentAddress(sessionId) === undefined }),
  }, (props: PropsRuntime<'conversation.input.model'> & { account: ModelsClient; selection: SessionModels; openAccount: () => void; available: boolean }) =>
    props.available ? <ModelPicker account={props.account} selection={props.selection} locked={props.locked} openAccount={() => openAccount()} /> : null));
  ctx.effect(() => ctx.commandUi.register({
    name: 'model', label: () => '选择模型', description: () => '选择 EasyWork 账号的模型',
    available: session => sessions.subagentAddress(session.sessionId) === undefined,
    ui: { kind: 'popupSelect', searchMode: 'fuzzy-label', searchLabels: () => ({ placeholder: '搜索模型', empty: '请先登录账号并加载模型', noResults: '没有匹配的模型' }),
      options: async session => {
        const selection = selectionOf(session.sessionId); await selection.load();
        return account.getSnapshot().snapshot.models.map(model => ({ id: model.id, label: model.name,
          group: { name: model.tier ?? 'other', label: tierLabels[model.tier ?? ''] ?? '其他模型' },
          active: selection.getSnapshot().current?.model === model.id, detail: model.vendor ?? undefined,
          ...(model.priceMultiplier == null ? {} : { badge: model.priceMultiplier + '×' }) }));
      },
      onSelect: async (option, session) => {
        const model = account.getSnapshot().snapshot.models.find(model => model.id === option.id);
        if (!model) throw new Error('所选模型已不可用，请刷新列表。');
        await selectionOf(session.sessionId).select(model);
      },
    },
  }), 'easywork.models.command');
}
