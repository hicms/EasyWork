import * as React from 'react';
import { Menu, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';

export interface PointMenuProps {
  /** Viewport coordinates of the pointer or focused element that asked for the menu. */
  point: { readonly x: number; readonly y: number };
  items: readonly MenuEntry[];
  onSelect(id: string): void;
  onClose(): void;
}

/** The official Menu opened at a screen point, for context menus that have no trigger button. */
export function PointMenu({ point, items, onSelect, onClose }: PointMenuProps) {
  // Menu places itself 4px below the anchor; start the first row at the pointer instead.
  const anchorRect = React.useCallback(() => new DOMRect(point.x, point.y - 4, 0, 0), [point.x, point.y]);
  return <Menu open portal compact autoFocus items={items} onSelect={onSelect} onClose={onClose}
    anchor={<span aria-hidden />} getAnchorRect={anchorRect} />;
}
