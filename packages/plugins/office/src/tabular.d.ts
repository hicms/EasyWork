export declare function extractTabularText(kind: 'csv' | 'xlsx', bytes: Uint8Array, signal?: AbortSignal): Promise<{ markdown: string; warnings: readonly string[] }>;
