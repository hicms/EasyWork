export const styles = `
.easywork-models { color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;width:100%;box-sizing:border-box }
.easywork-models * { box-sizing:border-box }
.easywork-models h2 { font-size:22px;margin:0 0 6px }
.easywork-models p { margin:0 0 16px;color:var(--dsw-alias-label-secondary) }
.easywork-models .ew-card { padding:22px;border:1px solid var(--dsw-alias-interactive-bg-hover);border-radius:14px;background:var(--dsw-alias-bg-layer-1);margin-bottom:22px }
.easywork-models label { display:grid;gap:6px;font-size:13px }
.easywork-models input { font:inherit;min-height:38px;padding:8px 10px;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-interactive-bg-hover);border-radius:8px;background:var(--dsw-alias-bg-layer-2);width:100%;min-width:0 }
.easywork-models button { font:inherit;cursor:pointer;color:inherit }
.easywork-models button:disabled { cursor:default;opacity:.55 }
.easywork-models button:focus-visible,.easywork-models summary:focus-visible { outline:2px solid var(--dsw-alias-label-secondary);outline-offset:-2px }
.easywork-models .ew-button { border:1px solid var(--dsw-alias-interactive-bg-hover);border-radius:8px;background:var(--dsw-alias-bg-layer-2);padding:8px 13px }
.easywork-models .ew-primary { background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted) }
.easywork-models .ew-login { max-width:420px;display:grid;gap:15px }
.easywork-models .ew-heading { display:flex;align-items:center;justify-content:space-between;gap:12px }
.easywork-models .ew-caption { font-size:12px;color:var(--dsw-alias-label-secondary) }
.easywork-models .ew-error { color:var(--dsw-alias-state-error-primary);margin:10px 12px;overflow-wrap:anywhere }
.easywork-models .ew-search { margin:0 0 12px }
.easywork-models .ew-group { padding:12px 12px 5px;font-size:11px;font-weight:500;color:var(--dsw-alias-label-secondary) }
.easywork-models .ew-model-row { display:flex;align-items:center;gap:8px;padding:9px 10px;width:100%;min-width:0;min-height:40px;border:0;border-radius:7px;background:transparent;text-align:left;font-size:13px }
.easywork-models button.ew-model-row:hover,.easywork-models button.ew-model-row:focus-visible,.easywork-models .ew-model-row[aria-selected=true] { background:var(--dsw-alias-interactive-bg-hover) }
.easywork-models .ew-vendor { width:20px;height:20px;flex:0 0 20px;display:inline-flex;align-items:center;justify-content:center }
.easywork-models .ew-vendor svg { display:block;width:20px;height:20px }
.easywork-models .ew-model-name { min-width:0;flex:1;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.easywork-models .ew-selected { width:14px;flex:0 0 14px;display:flex;align-items:center }
.easywork-models .ew-selected svg { width:14px;height:14px }
.easywork-models .ew-capabilities { display:flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);flex:0 0 auto }
.easywork-models .ew-capabilities span { display:inline-flex }
.easywork-models .ew-capabilities svg { width:14px;height:14px }
.easywork-models .ew-price { font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);padding:1px 5px;border-radius:5px;flex:0 0 auto }
.easywork-models .ew-controls { display:grid;gap:10px;padding:8px 12px 14px }
.easywork-models .ew-control { display:grid;gap:6px;min-width:0;font-size:12px }
.easywork-models .ew-reasoning-options { display:flex;flex-wrap:wrap;gap:3px;min-width:0;padding:3px;border-radius:9px;background:var(--dsw-alias-bg-layer-2) }
.easywork-models .ew-reasoning-options button { flex:1 1 56px;max-width:100%;min-width:0;min-height:30px;padding:5px 9px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;overflow-wrap:anywhere }
.easywork-models .ew-reasoning-options button:hover:not(:disabled) { background:var(--dsw-alias-interactive-bg-hover) }
.easywork-models .ew-reasoning-options button[aria-pressed=true],.easywork-models .ew-reasoning-options button[aria-pressed=true]:hover { background:var(--dsw-alias-label-primary);color:var(--dsw-alias-label-primary-inverted) }
.easywork-models.ew-model-picker { display:inline-flex;width:auto;max-width:100%;min-width:0;flex:0 1 auto }
.ew-model-picker .ew-trigger { display:flex;align-items:center;gap:7px;max-width:230px;min-width:0;padding:5px 8px;border:0;border-radius:7px;background:transparent;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer }
.ew-model-picker .ew-trigger:hover,.ew-model-picker .ew-trigger[aria-expanded=true] { background:var(--dsw-alias-interactive-bg-hover) }
.ew-model-picker .ew-trigger .ew-vendor,.ew-model-picker .ew-trigger .ew-vendor svg { width:16px;height:16px;flex-basis:16px }
.ew-model-picker .ew-trigger > svg { flex:0 0 12px;width:12px;height:12px }
.ew-model-picker .ew-trigger-text { display:var(--dsh-composer-model-text-display,block);min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis }
.easywork-models.ew-model-menu { position:fixed;z-index:1200;display:flex;flex-direction:column;width:min(400px,calc(100vw - 16px));max-height:min(560px,75vh);min-height:0;overflow:hidden;padding:4px;border:1px solid var(--dsw-alias-interactive-bg-hover);border-radius:13px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 36px #0002;font-size:13px }
.ew-model-menu .ew-list { min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-interactive-bg-hover) transparent;padding:0 2px 5px;flex:1 1 auto }
.ew-model-menu .ew-menu-search { display:flex;align-items:center;gap:9px;padding:4px 9px;border-bottom:1px solid var(--dsw-alias-interactive-bg-hover);flex:0 0 auto;color:var(--dsw-alias-label-secondary) }
.ew-model-menu .ew-menu-search > svg { flex:0 0 16px }
.ew-model-menu .ew-menu-search input { flex:1;border:0;background:transparent;box-shadow:none;outline:0;padding:7px 0;min-height:34px;border-radius:0 }
.ew-model-menu .ew-menu-search input::-webkit-search-cancel-button { display:none }
.ew-model-menu .ew-icon-button { display:flex;align-items:center;justify-content:center;background:transparent;border:0;border-radius:5px;padding:5px;flex:0 0 auto;color:var(--dsw-alias-label-secondary) }
.ew-model-menu .ew-icon-button:hover { background:var(--dsw-alias-interactive-bg-hover) }
.ew-model-menu .ew-reasoning { flex:0 0 auto;min-height:39px;max-height:min(200px,max(39px,calc(var(--ew-menu-height,560px) - 140px)));overflow:auto;border-top:1px solid var(--dsw-alias-interactive-bg-hover) }
.ew-model-menu .ew-reasoning summary { display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;color:var(--dsw-alias-label-secondary);font-size:12px;list-style:none }
.ew-model-menu .ew-reasoning summary::-webkit-details-marker { display:none }
.ew-model-menu .ew-reasoning summary > svg:last-child { margin-left:auto;width:12px;height:12px }
.ew-model-menu .ew-reasoning[open] summary > svg:last-child { transform:rotate(180deg) }
.ew-model-menu .ew-menu-footer { display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px 3px;border-top:1px solid var(--dsw-alias-interactive-bg-hover);font-size:11px;color:var(--dsw-alias-label-secondary);flex:0 0 auto }
.ew-model-menu .ew-refresh { display:flex;align-items:center;gap:5px;border:0;background:transparent;padding:4px;border-radius:5px;font-size:11px }
.ew-model-menu .ew-refresh svg { width:13px;height:13px }
.ew-model-launcher { display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--dsw-alias-label-primary);padding:9px;cursor:pointer;font:inherit;text-align:left;overflow:hidden }
.ew-model-launcher span:last-child { overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
@media(max-width:560px) { .easywork-models .ew-card { padding:16px }.easywork-models .ew-model-row { gap:7px;padding:9px 7px } }
`;
