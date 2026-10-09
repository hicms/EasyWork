/** Host-only authenticated enterprise transport. Never exposes backend or bridge credentials. */
export interface EnterpriseRequest {
  plugin: string;
  operation: string;
  method: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
}
export interface EnterpriseService {
  identity(signal?: AbortSignal): Promise<{ memberId: string; organizationId: string }>;
  request<T = unknown>(request: EnterpriseRequest): Promise<T>;
}
/** Fixed extension namespace; arbitrary URLs, query strings and administrative routes are forbidden. */
export function enterpriseExtensionPath(plugin: string, operation: string): string {
  const identifier = /^[a-z][a-z0-9-]{0,63}$/;
  if (!identifier.test(plugin) || !identifier.test(operation)) throw new Error('Invalid enterprise extension operation');
  return `/api/extensions/${plugin}/${operation}`;
}
