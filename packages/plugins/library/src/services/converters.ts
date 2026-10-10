import type { LibraryAssetKind } from 'easywork-contracts/library';

export interface ConversionResult {
  readonly markdown: string;
  readonly warnings: readonly string[];
  readonly locations: readonly { readonly kind: 'page' | 'paragraph' | 'slide'; readonly index: number; readonly label: string }[];
}

export async function convertToMarkdown(kind: LibraryAssetKind, bytes: Uint8Array, signal?: AbortSignal): Promise<ConversionResult> {
  signal?.throwIfAborted();
  if (kind === 'markdown' || kind === 'text') {
    try { return { markdown: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n'), warnings: [], locations: [] }; }
    catch { throw new Error('library/invalid-text'); }
  }
  const { convertDocumentToMarkdown } = await import('./document-converters.js');
  signal?.throwIfAborted();
  return convertDocumentToMarkdown(kind, bytes, signal);
}
