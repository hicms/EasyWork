/** Fixed portal positioning cannot expand the composer's overflow area. */
export function placeMenu(menu: HTMLElement, anchor: HTMLElement): void {
  const viewport = window.visualViewport;
  const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
  const topEdge = (viewport?.offsetTop ?? 0) + 8;
  const rightEdge = leftEdge + (viewport?.width ?? document.documentElement.clientWidth) - 16;
  const bottomEdge = topEdge + (viewport?.height ?? document.documentElement.clientHeight) - 16;
  const rect = anchor.getBoundingClientRect();
  const width = Math.max(0, Math.min(400, rightEdge - leftEdge));
  const above = Math.max(0, rect.top - topEdge - 8);
  const below = Math.max(0, bottomEdge - rect.bottom - 8);
  const useAbove = above >= Math.min(360, menu.scrollHeight) || above >= below;
  const available = Math.min(560, useAbove ? above : below);
  menu.style.setProperty('--ew-menu-height', available + 'px');
  menu.style.width = width + 'px'; menu.style.maxHeight = available + 'px';
  const height = menu.getBoundingClientRect().height;
  menu.style.left = Math.min(Math.max(rect.right - width, leftEdge), rightEdge - width) + 'px';
  menu.style.top = Math.max(topEdge, Math.min(useAbove ? rect.top - height - 8 : rect.bottom + 8, bottomEdge - height)) + 'px';
}
