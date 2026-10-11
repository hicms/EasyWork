/** One visual palette for EasyWork's pages and the official DSH theme layer. */
const palette = {
  canvas: { light: '#ffffff', dark: '#1c1d20' },
  sidebar: { light: '#f5f6f8', dark: '#151619' },
  surface: { light: '#ffffff', dark: '#23252a' },
  raised: { light: '#f8f9fb', dark: '#292c32' },
  ink: { light: '#16181d', dark: '#eeeff2' },
  secondary: { light: '#626976', dark: '#b0b6c2' },
  muted: { light: '#737986', dark: '#9ca2af' },
  line: { light: '#e9ebef', dark: '#303238' },
  strongLine: { light: '#dce0e7', dark: '#41444d' },
  hover: { light: '#f5f6f8', dark: '#27292e' },
  accent: { light: '#5550a5', dark: '#bbb5ff' },
  accentSoft: { light: '#eceafd', dark: '#302c47' },
  solid: { light: '#17191f', dark: '#f0f0f3' },
  solidText: { light: '#ffffff', dark: '#18191d' },
} as const;

const fixed = (value: string) => ({ light: value, dark: value });

/** Public DSH variables only; the installed-package contract test guards their names. */
export const themeTokenOverrides = {
  '--dsw-alias-bg-base': palette.canvas,
  '--dsw-alias-bg-layer-1': palette.surface,
  '--dsw-alias-bg-layer-2': palette.surface,
  '--dsw-alias-bg-layer-3': palette.raised,
  '--dsw-alias-bg-module-platform': palette.hover,
  '--dsw-alias-bg-overlay': palette.raised,
  '--dsw-alias-bg-document-preview': palette.sidebar,
  '--dsw-alias-label-primary': palette.ink,
  '--dsw-alias-label-primary-dimmed': palette.ink,
  '--dsw-alias-label-secondary': palette.secondary,
  '--dsw-alias-label-tertiary': palette.muted,
  '--dsw-alias-label-caption': palette.muted,
  '--dsw-alias-label-dimmed': palette.muted,
  '--dsw-alias-label-primary-foreground': palette.solidText,
  '--dsw-alias-label-primary-inverted': palette.solidText,
  '--dsw-alias-border-l1': palette.line,
  '--dsw-alias-border-l2': palette.line,
  '--dsw-alias-border-l2-darkmode-thin': palette.line,
  '--dsw-alias-border-l3': palette.strongLine,
  '--dsw-alias-border-l4': palette.strongLine,
  '--dsw-alias-brand-primary': palette.solid,
  '--dsw-alias-button-primary-fill': palette.solid,
  '--dsw-alias-button-primary-hover': { light: '#343740', dark: '#d9dce3' },
  // Native conversation send buttons keep white text in both modes.
  '--dsw-alias-button-info-fill': { light: '#17191f', dark: '#5550a5' },
  '--dsw-alias-button-info-hover': { light: '#343740', dark: '#625bb4' },
  '--dsw-alias-button-elevated-fill': palette.surface,
  '--dsw-alias-button-floating-fill': palette.surface,
  '--dsw-alias-button-floating-hover': palette.hover,
  '--dsw-alias-button-ghost-active-fill': palette.accentSoft,
  '--dsw-alias-interactive-bg-hover': palette.accentSoft,
  '--dsw-alias-interactive-bg-hover-solid': palette.hover,
  '--dsw-alias-interactive-bg-active': palette.accentSoft,
  '--dsw-alias-link': palette.accent,
  '--dsw-alias-state-business-primary': palette.accent,
  '--dsw-alias-state-business-tertiary': palette.accentSoft,
  '--dsw-alias-settings-card-fill': palette.surface,
  '--dsw-alias-settings-card-stroke': palette.line,
  '--dsw-alias-menu-icon': palette.secondary,
  '--dsw-alias-markdown-code-block': palette.sidebar,
  '--dsw-alias-markdown-code-block-banner': palette.hover,
  '--dsw-specific-sidebar-fill': palette.sidebar,
  '--dsw-specific-sidebar-nav-item-active': palette.accentSoft,
  '--dsw-specific-sidebar-nav-item-active-accent': palette.accentSoft,
  '--dsw-specific-sidebar-nav-item-hover': palette.hover,
  '--dsw-specific-input-major': palette.surface,
  '--dsw-specific-selector': palette.hover,
  '--dsw-specific-bubble': palette.hover,
  '--dsw-radius-xs': fixed('4px'),
  '--dsw-radius-sm': fixed('8px'),
  '--dsw-radius-md': fixed('10px'),
  '--dsw-radius-lg': fixed('14px'),
  '--dsw-radius-xl': fixed('18px'),
  '--dsw-radius-panel': fixed('18px'),
  '--dsw-font-family': fixed('Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'),
  '--dsw-elevation-soft': { light: '0 2px 12px #23263706', dark: '0 2px 12px #00000012' },
  '--dsw-elevation-panel': { light: '0 8px 32px #2326370d', dark: '0 8px 32px #00000026' },
  '--dsw-elevation-prominent': { light: '0 20px 70px #17191f1f', dark: '0 20px 70px #00000055' },
} as const;

/** Existing consumers keep semantic references, never a second literal palette. */
export const tokens = {
  canvas: 'var(--dsw-alias-bg-base)',
  sidebar: 'var(--dsw-specific-sidebar-fill)',
  card: 'var(--dsw-alias-bg-layer-1)',
  selected: 'var(--dsw-specific-sidebar-nav-item-active)',
  border: 'var(--dsw-alias-border-l2)',
  text: 'var(--dsw-alias-label-primary)',
  secondary: 'var(--dsw-alias-label-secondary)',
} as const;

export type EasyWorkTokens = typeof tokens;

/** Scoped aliases also work when a feature is installed without the EasyWork bundle. */
export const presentationCss = `
:where(.easywork-page,.easywork-surface,.wd-dialog,[data-wd-control]){
  --easywork-font-family:var(--dsw-font-family);
  --easywork-space-page:clamp(20px,3.5vw,48px);
  --easywork-space-card:20px;
  --easywork-heading-size:29px;
  --easywork-card-radius:var(--dsw-radius-lg);
  --easywork-control-radius:var(--dsw-radius-md);
  --easywork-accent:var(--dsw-alias-state-business-primary);
  --easywork-accent-soft:var(--dsw-specific-sidebar-nav-item-active-accent);
  --easywork-ink:var(--dsw-alias-label-primary);
  --easywork-muted:var(--dsw-alias-label-tertiary);
  --easywork-line:var(--dsw-alias-border-l2);
  --easywork-canvas:var(--dsw-alias-bg-base);
  --easywork-surface:var(--dsw-alias-bg-layer-1);
  --easywork-hover:var(--dsw-alias-interactive-bg-hover-solid);
  --easywork-shadow:var(--dsw-elevation-soft);
}
@media(max-width:640px){:where(.easywork-page,.easywork-surface,.wd-dialog){--easywork-heading-size:25px;--easywork-space-page:20px}}
`;
