import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { ModelPicker } from '../src/client/ModelPicker.tsx';
import { defaultControls, encodeControls, selectedControls } from '../src/catalog.ts';
import type { ServiceModel, Json } from '../src/shared.ts';

const names = ['DeepSeek V3.2', 'GPT 5.4', 'Claude Sonnet 4.6', 'Gemini 3.1 Pro', 'Grok 4.7 Fast', 'Kimi K2.5', 'GLM 5', 'Qwen 3.5 Plus', 'MiniMax M3.1 Flash', 'Ling 2.5'];
const vendors = ['deepseek', 'openai', 'anthropic', 'google', 'xai', 'moonshot', 'zhipu', 'alibaba', 'minimax', 'antgroup'];
const models: ServiceModel[] = Array.from({ length: 24 }, (_, index) => ({
  id: 'model-' + index, name: names[index % names.length] + (index >= names.length ? ' · Extended model name for narrow panes' : ''),
  vendor: vendors[index % vendors.length], tier: ['flagship', 'balanced', 'fast'][Math.floor(index / 8)],
  protocol: 'openai-completions', isDefault: index === 0, supportsImages: index % 3 === 0,
  supportsReasoning: true, supportsTools: true, contextWindow: 200_000, priceMultiplier: index % 2 ? 1 : 2.5,
  reasoningControls: [{ path: 'reasoning_effort', default: 'high', values: ['low', 'high'] },
    ...(index === 0 ? [
      { path: 'thinking.type', default: {type:'enabled',keep:'all'}, values:[{type:'enabled',keep:'all'},{type:'disabled'}] },
      ...['thinking.display', 'preserve_thinking', 'reasoning_split', 'thinking.clear_thinking'].map(path => ({path, default: true, values: [true,false]})),
    ] : [])],
}));
let accountState = { snapshot: { user: { id: 'fixture', email: 'fixture@example.test' }, models, error: null }, busy: false, ready: true, error: null };
const listeners = new Set<() => void>(); let chosen = 'model-0';
let selectionState = { current: { provider: 'easywork', model: chosen, reasoningEffort: encodeControls(defaultControls(models[0])) }, busy: false, error: null };
const selectionListeners = new Set<() => void>();
const account = { getSnapshot: () => accountState, subscribe: (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); }, refresh: async () => {} };
const selection = {
  getSnapshot: () => selectionState, subscribe: (cb: () => void) => { selectionListeners.add(cb); return () => selectionListeners.delete(cb); },
  load: async () => {}, select: async (model: ServiceModel) => { chosen = model.id; selectionState = { ...selectionState, current: { provider: 'easywork', model: chosen, reasoningEffort: encodeControls(defaultControls(model)) } }; selectionListeners.forEach(cb => cb()); },
  changeControl: async (model: ServiceModel, path: string, value: Json) => {
    document.documentElement.dataset.lastReasoningChange = JSON.stringify({ path, value });
    selectionState = { ...selectionState, current: { ...selectionState.current, reasoningEffort: encodeControls({ ...selectedControls(model,selectionState.current.reasoningEffort), [path]:value }) } };
    selectionListeners.forEach(cb => cb());
  },
};
function Fixture() {
  const [locked, setLocked] = React.useState(false);
  return <div className="workspace"><aside>EasyWork</aside><main className="chat" data-testid="chat">
    <header><h1>模型选择器测试</h1><button type="button" onClick={() => setLocked(value => !value)}>切换锁定</button></header>
    <div className="conversation">聊天内容的位置不应随模型菜单打开而改变。</div>
    <div className="composer" data-testid="composer"><textarea placeholder="发送消息" /><div className="toolbar"><span>＋</span><span className="spacer" />
      <div style={{ display: 'flex', flex: '0 0 auto' }}><ModelPicker account={account as never} selection={selection as never} locked={locked} openAccount={() => {}} /></div><button className="send" type="button">↑</button>
    </div></div>
  </main><div className="right-panel">会话资源</div></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
