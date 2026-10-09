/** Local carrier startup messages; the official Profile owns the workspace UI. */
const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

import { PRODUCT_NAME } from './startup-contract.ts'

function document(title: string, content: string): string {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${PRODUCT_NAME}</title>
<style>:root{color-scheme:light dark;--bg:#f5f7fa;--panel:#fff;--text:#171a20;--muted:#626b78;--border:#dce1e8}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;display:grid;min-height:100vh;place-items:center}main{width:min(440px,calc(100vw - 48px));padding:32px;background:var(--panel);border:1px solid var(--border);border-radius:16px;animation:appear .16s ease-out}header{font-size:22px;font-weight:600;margin-bottom:24px}header span{color:#2463eb}h1{font-size:22px;margin:0 0 8px}p{color:var(--muted);margin:0 0 20px;overflow-wrap:anywhere}.spinner{width:28px;height:28px;border:3px solid var(--border);border-top-color:#2463eb;border-radius:50%;animation:spin .8s linear infinite;margin:24px auto}@keyframes spin{to{transform:rotate(360deg)}}@keyframes appear{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){main,.spinner{animation:none}}@media(prefers-color-scheme:dark){:root{--bg:#121212;--panel:#202020;--text:#e7e7e7;--muted:#a5a5a5;--border:#414141}}</style>
<main><header><span>W</span> ${PRODUCT_NAME}</header><h1 role="status">${escapeHtml(title)}</h1>${content}</main></html>`
}

export function startupErrorHtml(message: string): string {
  return document('工作区启动失败', `<p>${escapeHtml(message)}</p><p>请通过“应用程序 → 退出 ${PRODUCT_NAME}”停止后台，检查本地运行环境后重新打开。</p>`)
}
