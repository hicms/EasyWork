import * as React from 'react';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { Icon, type IconName } from 'easywork-ui';
import { workbenchPanelCss } from '../styles.js';

export type BusinessPanelDefinition = {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly order: number;
  readonly description?: string;
  /** 规划中、尚无领域实现的功能：不注册侧栏入口与占位页，实现完成后置 false。 */
  readonly pending: boolean;
};

export const businessPanels = [
  { id: 'easywork-assistant', label: '助理', icon: 'assistant', order: 10, description: '创建和管理面向具体工作的 AI 助理。', pending: true },
  { id: 'easywork-automation', label: '定时任务', icon: 'automation', order: 40, description: '查看和管理周期性工作。', pending: true },
  { id: 'easywork-library', label: '资料库', icon: 'library', order: 50, description: '集中管理工作资料与任务成果。', pending: false },
  { id: 'easywork-more', label: '更多', icon: 'more', order: 60, description: '进入 EasyWork 的更多业务能力。', pending: true },
] as const satisfies readonly BusinessPanelDefinition[];

export type BusinessPanelProps = PropsRuntime<'main'> & InjectFace<{
  readonly label: string;
  readonly description: string;
}>;

export function BusinessPanel({ label, description }: BusinessPanelProps) {
  return (
    <section className="wd-workbench-panel">
      <style>{workbenchPanelCss}</style>
      <p className="wd-workbench-eyebrow">EASYWORK</p>
      <h1>{label}</h1>
      <p className="wd-workbench-description">{description}</p>
      <p className="wd-workbench-boundary">
        当前模块尚未接入领域数据。工作区、会话与新任务继续使用 DeepSeek Harness 原生能力。
      </p>
    </section>
  );
}

export type BusinessPanelIconProps = InjectFace<{ readonly icon: IconName }>;

export function BusinessPanelIcon({ icon }: BusinessPanelIconProps) {
  return <Icon name={icon} />;
}
