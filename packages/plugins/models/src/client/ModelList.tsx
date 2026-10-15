import * as React from 'react';
import { tierLabels, type ServiceModel } from '../shared.ts';
import { Icon, VendorIcon } from './Icons.tsx';

export function filterModels(models: readonly ServiceModel[], search: string): readonly ServiceModel[] {
  const query = search.trim().toLocaleLowerCase();
  return models.filter(model => [model.name, model.id, model.vendor ?? ''].some(value => value.toLocaleLowerCase().includes(query)));
}
export function ModelList({ models, selected, onSelect, disabled, search = '' }: {
  models: readonly ServiceModel[]; selected?: string; onSelect?: (model: ServiceModel) => void; disabled?: boolean; search?: string;
}) {
  const visible = filterModels(models, search);
  const tiers = [...new Set(visible.map(model => model.tier ?? 'other'))].sort((left, right) => {
    const order = ['flagship', 'balanced', 'fast', 'other'];
    return (order.includes(left) ? order.indexOf(left) : 4) - (order.includes(right) ? order.indexOf(right) : 4);
  });
  if (!visible.length) return <p role="status">{models.length ? '没有匹配的模型' : '暂无可用模型，请刷新或联系服务管理员。'}</p>;
  return <div className="ew-list" role={onSelect ? 'listbox' : 'list'} aria-label="模型列表">
    {tiers.map(tier => <div key={tier} role={onSelect ? 'group' : undefined} aria-label={tierLabels[tier] ?? '其他模型'}>
      <div className="ew-group">{tierLabels[tier] ?? '其他模型'}</div>
      {visible.filter(model => (model.tier ?? 'other') === tier).map(model => {
        const details = [model.vendor, model.contextWindow ? `${Math.round(model.contextWindow / 1000)}K 上下文` : null, model.isDefault ? '服务默认' : null].filter(Boolean).join(' · ');
        const content = <><span className="ew-selected">{selected === model.id ? <Icon name="check" /> : null}</span><VendorIcon vendor={model.vendor} />
          <span className="ew-model-name" title={model.name}>{model.name}</span>
          <span className="ew-capabilities">
            {model.supportsImages ? <span role="img" aria-label="支持图片输入" title="支持图片输入"><Icon name="image" /></span> : null}
            {model.supportsReasoning ? <span role="img" aria-label="支持思考" title="支持思考"><Icon name="brain" /></span> : null}
            {model.supportsTools ? <span role="img" aria-label="支持工具调用" title="支持工具调用"><Icon name="tool" /></span> : null}
          </span>
          {model.priceMultiplier != null ? <span className="ew-price" title="相对参考价格倍率">{model.priceMultiplier}×</span> : null}</>;
        return onSelect ? <button key={model.id} className="ew-model-row" type="button" role="option" aria-label={model.name} title={details} aria-selected={selected === model.id} disabled={disabled} onClick={() => onSelect(model)}>{content}</button>
          : <div key={model.id} className="ew-model-row" role="listitem" title={details}>{content}</div>;
      })}
    </div>)}
  </div>;
}
