import { isEditable } from '../file-menu/target.js';

/** A web link inside a conversation. */
export interface LinkTarget {
  /** Absolute `http:` or `https:` address. */
  readonly url: string;
  readonly sessionId: string;
}

/**
 * Resolve the web link under `element`, or `null` to leave the native menu alone.
 * Only links that the conversation renders count; the page's own anchors are not ours.
 */
export function resolveLinkTarget(element: Element): LinkTarget | null {
  if (isEditable(element)) return null;
  const anchor = element.closest('a[href]');
  // The attribute must itself be absolute: #top and relative paths resolve to the page origin but are not web links.
  if (!(anchor instanceof HTMLAnchorElement) || !/^https?:\/\//iu.test(anchor.getAttribute('href') ?? '')) return null;
  const sessionId = anchor.closest<HTMLElement>('[data-conversation-session]')?.dataset.conversationSession;
  return sessionId === undefined ? null : { url: anchor.href, sessionId };
}
