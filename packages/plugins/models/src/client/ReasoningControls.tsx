import * as React from 'react';
import { controlLabel, valueLabel, record, type Json, type ReasoningControl } from '../shared.ts';

const labels: Readonly<Record<string, string>> = {
  none: '无', minimal: '最小', low: '低', medium: '中', high: '高', xhigh: '极高', max: '最高',
  enabled: '开启', disabled: '关闭', adaptive: '自适应', between_tools: '工具间思考',
  omitted: '隐藏', summarized: '摘要',
};
function choiceLabel(value: Json): string {
  const name = record(value) && typeof value.type === 'string' ? value.type : value;
  return typeof name === 'string' ? Object.hasOwn(labels,name) ? labels[name] : name : valueLabel(value);
}
export function ReasoningControls({ controls, values, disabled, onChange }: {
  controls: readonly ReasoningControl[]; values: Readonly<Record<string, Json>>; disabled: boolean;
  onChange: (path: string, value: Json) => void;
}) {
  const id = React.useId();
  const keyboard = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || !buttons.length) return;
    event.preventDefault(); event.stopPropagation();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next].focus({ preventScroll: true }); buttons[next].scrollIntoView({ block: 'nearest' });
  };
  return <div className="ew-controls">{controls.map((control, index) => {
    const names = control.values.map(choiceLabel);
    const ambiguous = new Set(names).size !== names.length;
    return <div className="ew-control" key={control.path}>
      <span id={`${id}-${index}`}>{controlLabel(control.path)}</span>
      <div className="ew-reasoning-options" role="group" aria-labelledby={`${id}-${index}`} onKeyDown={keyboard}>
        {control.values.map((value, choice) => {
          const wire = JSON.stringify(value); const active = wire === JSON.stringify(values[control.path]);
          return <button key={wire} type="button" aria-pressed={active} disabled={disabled} title={wire}
            onClick={() => { if (!active) onChange(control.path, value); }}>{ambiguous ? valueLabel(value) : names[choice]}</button>;
        })}
      </div>
    </div>;
  })}</div>;
}
