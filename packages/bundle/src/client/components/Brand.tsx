import * as React from 'react';
import { LogoMark } from 'easywork-ui';

export function BrandName() {
  return <span data-testid="easywork-brand">EasyWork</span>;
}

export function BrandMark() {
  return <LogoMark size={22} />;
}

export function DiagnosticsMark() {
  return <LogoMark size={16} />;
}
