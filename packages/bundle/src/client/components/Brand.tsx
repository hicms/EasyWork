import * as React from 'react';
import { LogoMark } from 'easywork-ui';
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { productName } from '../../brand.mjs';

export { productName } from '../../brand.mjs';

export function BrandName() {
  return <span data-testid="easywork-brand">{productName}</span>;
}

export function BrandMark() {
  return <LogoMark size={22} />;
}

export function HeroBrandMark({ size, className }: HeroBrandMarkOwnerProps) {
  return <span className={className} data-testid="easywork-hero-mark" style={{ display: 'inline-flex', alignItems: 'center' }}><LogoMark size={size} /></span>;
}

export function DiagnosticsMark() {
  return <LogoMark size={16} />;
}
