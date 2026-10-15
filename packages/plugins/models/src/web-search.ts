import { WebError } from '@deepseek-ai/dsh-web';
import type { WebSearchProvider, WebSearchResult, WebSearchSource } from '@deepseek-ai/dsh-web';
import type { ModelsAccount } from './account.ts';
import { AskError } from './ask-client.ts';
import { providerId, record } from './shared.ts';

function sources(value: unknown, maxResults?: number): WebSearchResult {
  if (!record(value) || !Array.isArray(value.results)) throw new WebError('搜索服务返回了无效结果。', 'WEB_PROVIDER_RESPONSE_INVALID');
  const results: WebSearchSource[] = value.results.map(item => {
    if (!record(item) || typeof item.url !== 'string' || typeof item.title !== 'string' || typeof item.snippet !== 'string') {
      throw new WebError('搜索服务返回了无效结果。', 'WEB_PROVIDER_RESPONSE_INVALID');
    }
    let url: URL;
    try { url = new URL(item.url); } catch { throw new WebError('搜索结果包含无效网址。', 'WEB_PROVIDER_RESPONSE_INVALID'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new WebError('搜索结果包含无效网址。', 'WEB_PROVIDER_RESPONSE_INVALID');
    return { url: item.url, ...(item.title ? { title: item.title } : {}), ...(item.snippet ? { snippet: item.snippet } : {}) };
  });
  return { sources: maxResults === undefined ? results : results.slice(0, maxResults), truncated: maxResults !== undefined && results.length > maxResults };
}

export function createSearchProvider(account: ModelsAccount): WebSearchProvider {
  return {
    id: providerId,
    // Credentials can be restored after registration; execution performs the authoritative check.
    available: () => true,
    async search(request, signal) {
      if (signal?.aborted) throw new WebError('搜索已取消。', 'WEB_ABORTED');
      const query = request.query.trim();
      if (!query || Array.from(query).length > 2000 || (request.maxResults !== undefined && (!Number.isSafeInteger(request.maxResults) || request.maxResults < 1))) {
        throw new WebError('搜索词须为 1–2000 个字符，结果数须为正整数。', 'WEB_SEARCH_INVALID_REQUEST');
      }
      try {
        const result = await account.search({ query, ...(request.maxResults === undefined ? {} : { maxResults: Math.min(request.maxResults, 100) }) }, signal);
        return sources(result, request.maxResults);
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw new WebError('搜索已取消。', 'WEB_ABORTED');
        if (error instanceof WebError) throw error;
        if (error instanceof AskError && error.status === 401) throw new WebError('请先登录 EasyWork 账号后使用搜索。', 'WEB_AUTH_REQUIRED');
        if (error instanceof AskError && error.status === 503) throw new WebError('搜索服务暂不可用，请检查服务端搜索配置或稍后重试。', 'WEB_PROVIDER_UNAVAILABLE');
        // Never forward upstream bodies or transport errors, which can contain credentials.
        throw new WebError('EasyWork 搜索请求失败，请稍后重试。', 'WEB_PROVIDER_ERROR');
      }
    },
  };
}
