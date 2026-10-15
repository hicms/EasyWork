import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import * as React from 'react';
import { source } from './source.mjs';

const { renderToStaticMarkup } = createRequire(import.meta.resolve('@deepseek-ai/dsh-client-ui-renderer/client'))('react-dom/server');
const { installExpertPresetMenu } = await source("export { installExpertPresetMenu } from './client/PresetMenu.tsx';");
const expert = 'wd-exp-requirement-analysis-advisor-example';

function render(current, sessionId) {
  let Component;
  const state = { current, options: [{ id: expert, name: '需求分析顾问' }, { id: 'standard', name: '标准', isDefault: true }] };
  const Native = props => {
    const visible = props.useAgentPresetSeat(value => value);
    return React.createElement('span', null, visible.options.map(row => row.name).join('、'));
  };
  const ctx = {
    sessions: { subagentAddress: () => undefined },
    slots: {
      entriesOfSlot: () => [{ inject() {}, component: Native }],
      subscribe: () => () => {},
      register: (options, component) => { assert.equal(options.name, 'conversation.hero.agentPreset'); Component = component; return () => {}; },
    },
    effect: callback => callback(),
  };
  installExpertPresetMenu(ctx, {});
  return renderToStaticMarkup(React.createElement(Component, { sessionId, useAgentPresetSeat: selector => selector(state), load: async () => {}, select: async () => {} }));
}

test('the initial composer never renders the inherited advisor name as a summoned expert', () => {
  for (const sessionId of [undefined, 'ordinary-session']) {
    const html = render(expert, sessionId);
    assert.doesNotMatch(html, /需求分析顾问|已召唤专家/);
    assert.match(html, /正在确认会话配置/);
  }
});

test('the ordinary composer keeps the native control with only native choices', () => {
  const html = render('standard', 'ordinary-session');
  assert.match(html, /标准/);
  assert.doesNotMatch(html, /需求分析顾问|正在确认/);
});
