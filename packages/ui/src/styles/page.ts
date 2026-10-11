import { presentationCss } from './tokens.js';

/** Shared page rhythm. Domain layouts and official shell geometry retain their owners. */
export const pageCss = `${presentationCss}
@layer easywork-business {
  :where(.easywork-page,.easywork-surface){box-sizing:border-box;min-width:0;color:var(--easywork-ink);background:var(--easywork-canvas);font:14px/1.65 var(--easywork-font-family)}
  :where(.easywork-page){padding:32px var(--easywork-space-page) 40px;min-height:100%}
  :where(.easywork-page-content){width:100%;max-width:1120px;min-width:0;margin-inline:auto}
  :where(.easywork-page-header){display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:32px}
  :where(.easywork-page-title){margin:0;font-size:var(--easywork-heading-size);line-height:1.4;font-weight:650;letter-spacing:-.7px;color:var(--easywork-ink)}
  :where(.easywork-page-description){margin:10px 0 0;max-width:680px;color:var(--easywork-muted);font-size:14px;line-height:1.8}
  :where(.easywork-page-eyebrow){margin:0 0 20px;color:var(--easywork-muted);font-size:12px;line-height:1.5;letter-spacing:.2px}
  :where(.easywork-toolbar){display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:24px}
  :where(.easywork-card){border:1px solid var(--easywork-line);border-radius:var(--easywork-card-radius);background:var(--easywork-surface);box-shadow:var(--easywork-shadow)}
  :where(.easywork-empty){padding:48px 24px;border:1px dashed var(--easywork-line);border-radius:var(--easywork-card-radius);color:var(--easywork-muted);text-align:center;line-height:1.8}
  :where(.easywork-page,.easywork-surface) :where(button,input,select,textarea){font-family:inherit}
  :where(.easywork-page,.easywork-surface) :focus-visible{outline:2px solid var(--easywork-accent);outline-offset:3px}
  @media(max-width:640px){:where(.easywork-page){padding:24px var(--easywork-space-page)}:where(.easywork-page-header){flex-wrap:wrap;gap:16px;margin-bottom:24px}}
}
`;
