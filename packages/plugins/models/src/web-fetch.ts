import { WebError } from '@deepseek-ai/dsh-web';
import type { WebFetchProvider } from '@deepseek-ai/dsh-web';
import type { ModelsAccount } from './account.ts';
import { AskError } from './ask-client.ts';
import { providerId, record } from './shared.ts';

function pageUrl(value: string): string {
  const invalid = () => new WebError('网页地址须为不含账号密码的 HTTP(S) 网址。', 'WEB_FETCH_INVALID_URL');
  if (value.length > 8192) throw invalid();
  let url: URL;
  try { url = new URL(value); } catch { throw invalid(); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw invalid();
  return url.href;
}

export function createFetchProvider(account: ModelsAccount): WebFetchProvider {
  return {
    id: providerId,
    available: () => true,
    async fetch(request, signal) {
      if (signal?.aborted) throw new WebError('网页提取已取消。', 'WEB_ABORTED');
      const url = pageUrl(request.url.trim());
      try {
        const result = await account.fetch({ url }, signal);
        if (!record(result) || typeof result.url !== 'string' || typeof result.content !== 'string'
          || !result.content.trim() || typeof result.truncated !== 'boolean') {
          throw new WebError('网页提取服务返回了无效结果。', 'WEB_PROVIDER_RESPONSE_INVALID');
        }
        let resultUrl: string;
        try { resultUrl = pageUrl(result.url); } catch { throw new WebError('网页提取结果包含无效网址。', 'WEB_PROVIDER_RESPONSE_INVALID'); }
        // The native contract requires a status. This denotes extraction success, not origin HTTP status.
        const notice = '[Exa extracted content; source HTTP status unknown. May be cached or incomplete.]\n\n';
        return { url: resultUrl, statusCode: 200, body: { kind: 'text', content: notice + result.content }, truncated: result.truncated };
      } catch (error) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw new WebError('网页提取已取消。', 'WEB_ABORTED');
        if (error instanceof WebError) throw error;
        if (error instanceof AskError && error.status === 401) throw new WebError('请先登录 EasyWork 账号后使用网页提取。', 'WEB_AUTH_REQUIRED');
        if (error instanceof AskError && error.status === 400) throw new WebError('网页地址无效或不是公开网页地址。', 'WEB_FETCH_INVALID_URL');
        if (error instanceof AskError && error.status === 404) throw new WebError('服务端尚未启用网页提取接口，请更新 ask-service。', 'WEB_PROVIDER_UNAVAILABLE');
        if (error instanceof AskError && error.status === 503) throw new WebError('服务端尚未配置 Exa 网页提取。', 'WEB_PROVIDER_UNAVAILABLE');
        throw new WebError('Exa 网页提取失败，请稍后重试。', 'WEB_PROVIDER_ERROR');
      }
    },
  };
}
