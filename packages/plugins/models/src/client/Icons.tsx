import * as React from 'react';
import { vendorArt } from './vendor-art.tsx';

type IconName = 'brain' | 'image' | 'tool' | 'check' | 'chevron' | 'search' | 'refresh' | 'close' | 'model';
const paths: Record<IconName, React.ReactNode> = {
  brain: <><path d="M12 18V5a3 3 0 0 0-5.8-1A4 4 0 0 0 3 10a4 4 0 0 0 1 7.8A4 4 0 0 0 12 18Zm0 0a4 4 0 0 0 8-.2A4 4 0 0 0 21 10a4 4 0 0 0-3.2-6A3 3 0 0 0 12 5"/><path d="M8 8a3 3 0 0 1-3 3m11-3a3 3 0 0 0 3 3M8 15a3 3 0 0 0 4 3m4-3a3 3 0 0 1-4 3"/></>,
  image: <><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></>,
  tool: <path d="m14 6 4 4m-5-5a6 6 0 0 0-7 8L2 17a2.8 2.8 0 0 0 4 4l4-4a6 6 0 0 0 8-7l-4 4-4-4 4-4Z"/>,
  check: <path d="m5 12 4 4L19 6"/>, chevron: <path d="m6 9 6 6 6-6"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  model: <><rect x="4" y="6" width="16" height="14" rx="4"/><path d="M12 2v4M8 11v2m8-2v2m-7 3h6"/></>,
};
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
export function VendorIcon({ vendor }: { vendor: string | null | undefined }) {
  const id = 'ew-vendor-' + React.useId().replace(/[^A-Za-z0-9_-]/g, '');
  const art = vendor && Object.hasOwn(vendorArt, vendor) ? vendorArt[vendor] : undefined;
  return <span className="ew-vendor" title={art?.company ?? vendor ?? '模型'} aria-hidden="true">
    {art ? <svg width="20" height="20" viewBox="0 0 24 24" {...art.svg}>{art.art(id)}</svg> : <Icon name="model" />}
  </span>;
}
