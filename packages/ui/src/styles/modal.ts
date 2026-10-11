import { presentationCss } from './tokens.js';

export const modalCss = `${presentationCss}
.wd-dialog-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:24px;background:var(--dsw-alias-bg-mask-2)}
.wd-dialog{position:relative;box-sizing:border-box;width:min(720px,calc(100vw - 48px));max-height:calc(100dvh - 48px);overflow:auto;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent;border:1px solid var(--easywork-line);border-radius:var(--dsw-radius-xl);background:var(--easywork-surface);color:var(--easywork-ink);box-shadow:var(--dsw-elevation-prominent);outline:none;font:14px/1.65 var(--easywork-font-family);animation:wd-dialog-enter .16s ease-out}
.wd-dialog *{box-sizing:border-box}
.wd-dialog button{font:inherit;white-space:nowrap}
.wd-dialog>.wd-dialog-close{position:absolute;z-index:2;right:16px;top:16px;width:32px;height:32px;min-height:32px;padding:0;display:grid;place-items:center;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer}
.wd-dialog-close svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}
.wd-dialog-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}.wd-dialog-close:focus-visible{outline:2px solid var(--easywork-accent);outline-offset:2px}
@keyframes wd-dialog-enter{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){.wd-dialog{animation:none}}
@media(max-width:640px){.wd-dialog-backdrop{padding:12px}.wd-dialog{width:calc(100vw - 24px);max-height:calc(100dvh - 24px);height:auto;border-radius:12px}.wd-dialog>.wd-dialog-close{right:8px;top:8px;width:44px;height:44px;min-height:44px}}
`;
