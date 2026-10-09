import * as React from 'react';
import { useEffect, useState } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';

type AccountStatus = { displayName: string; email: string; organizationName: string; role: 'OWNER' | 'ADMIN' | 'MEMBER'; desktop?: boolean };
type SyncRow = { sessionId: string; recordCount: number; acknowledged: number; pending: boolean; deletePending: boolean; deleted: boolean; error: string | null };
type SyncStatus = { desktop: true; sessions: SyncRow[] };
const style = { maxWidth: 480, color: 'var(--dsw-alias-label-primary)', fontFamily: 'inherit' };
const button = { padding: '9px 16px', borderRadius: 10, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-2)', color: 'inherit', font: 'inherit', cursor: 'pointer' };

function Account(_props: PropsRuntime<'settings.section'>) {
  const [desktop, setDesktop] = useState(false);
  const [sync, setSync] = useState<SyncStatus>();
  const [syncError, setSyncError] = useState('');
  const [account, setAccount] = useState<AccountStatus>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const lifetime = new AbortController();
    const load = () => fetch('/api/auth/me', { credentials: 'same-origin', signal: AbortSignal.any([lifetime.signal, AbortSignal.timeout(8000)]) })
      .then(async response => {
        if (response.status === 404 || response.status === 401) { setDesktop(true); setAccount(undefined); setError(''); return; }
        const value = await response.json() as AccountStatus & { local?: boolean };
        if (value.local || value.desktop) setDesktop(true);
        if (!response.ok) throw new Error('企业登录已失效，请重新登录。');
        if (!value.displayName || !value.email || !value.organizationName || !['OWNER', 'ADMIN', 'MEMBER'].includes(value.role)) throw new Error('企业账号信息不完整，请重试。');
        if (!lifetime.signal.aborted) { setAccount(value); setError(''); }
      }).catch(cause => { if (!lifetime.signal.aborted) { setAccount(undefined); setError(cause instanceof Error ? cause.message : '企业账号读取失败。'); } })
      .finally(() => { if (!lifetime.signal.aborted) setLoading(false); });
    void load();
    const timer = setInterval(() => { void load(); }, 30000);
    return () => { clearInterval(timer); lifetime.abort(); };
  }, []);
  const refreshSync = async (signal?: AbortSignal) => {
    const response = await fetch('/api/workdsh-enterprise-sync', { credentials: 'same-origin', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('正文同步状态未确认。');
    const value = await response.json() as SyncStatus;
    if (value.desktop !== true || !Array.isArray(value.sessions)) throw new Error('正文同步状态无效。');
    setSync(value); setSyncError('');
  };
  useEffect(() => {
    if (!desktop) return;
    const lifetime = new AbortController();
    const load = () => refreshSync(lifetime.signal).catch(() => { if (!lifetime.signal.aborted) setSyncError('正文同步状态未确认，请检查企业登录和网络。'); });
    void load(); const timer = setInterval(() => { void load(); }, 10000);
    return () => { clearInterval(timer); lifetime.abort(); };
  }, [desktop]);
  const syncAction = async (action: 'retry' | 'delete', sessionId?: string) => {
    setBusy(true); setSyncError('');
    try {
      const response = await fetch('/api/workdsh-enterprise-sync', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...(sessionId ? { sessionId } : {}) }), signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error('正文同步操作未确认。');
      await refreshSync();
    } catch { setSyncError('正文同步操作未确认，请检查登录和网络后重试。'); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('退出失败，请重试。');
      const value = await response.json().catch(() => ({})) as { local?: boolean };
      if (value.local === true) { setDesktop(true); setAccount(undefined); setError('已退出企业账号。'); return; }
      window.location.assign('/login');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '退出失败，请重试。'); }
    finally { setBusy(false); }
  };
  return <section style={style} data-testid="enterprise-account">
    <h1 style={{ fontSize: 24, marginTop: 0 }}>企业账号</h1>
    <p style={{ color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.7 }}>查看当前登录的企业成员信息。</p>
    {loading ? <p role="status">正在读取账号…</p> : account ? <>
      <div style={{ padding: 24, borderRadius: 16, border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)' }}>
        <strong style={{ fontSize: 18 }}>{account.displayName}</strong>
        <p style={{ color: 'var(--dsw-alias-label-secondary)' }}>{account.email}</p>
        <dl style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 14, marginTop: 24, marginBottom: 0 }}>
          <dt>所在组织</dt><dd style={{ margin: 0 }}>{account.organizationName}</dd>
          <dt>组织角色</dt><dd style={{ margin: 0 }}>{{ OWNER: '负责人', ADMIN: '管理员', MEMBER: '成员' }[account.role]}</dd>
        </dl>
      </div>
      <button style={{ ...button, marginTop: 16 }} disabled={busy} onClick={() => void logout()}>{busy ? '正在退出…' : '退出企业账号'}</button>
    </> : <div><p>企业插件已安装。连接公司后台并登录后，才会启用企业账号和权限。个人数据不会自动复制到企业空间。</p><button style={button} onClick={() => window.location.assign('workdsh://entry')}>连接企业</button></div>}
    {desktop && account && <section aria-label="企业正文同步" style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 18 }}>企业正文同步</h2>
      <p style={{ lineHeight: 1.7, color: 'var(--dsw-alias-label-secondary)' }}>同步用户与助手已显示的文字；不上传思考、工具轨迹或附件。失败时本地记录保留，可重试。已同步正文由本组织有权限的管理员只读查看。</p>
      <button style={button} disabled={busy} onClick={() => void syncAction('retry')}>重试同步</button>
      {sync && <p role="status">{sync.sessions.filter(row => !row.deleted && (row.pending || row.error)).length} 个会话待确认</p>}
      {sync?.sessions.map(row => <div key={row.sessionId} style={{ marginTop: 12, borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: 12 }}>
        <code>{row.sessionId}</code><p>{row.deleted ? '后台正文已删除；此会话不再上传。' : `后台已确认 ${row.acknowledged} / 本地 ${row.recordCount} 条正文`}</p>
        {row.deletePending && <p>后台删除待确认；此会话已暂停上传，可重试。</p>}
        {row.error && <p role="alert">{row.error}</p>}
        {!row.deleted && row.acknowledged > 0 && <button style={button} disabled={busy} onClick={() => { if (window.confirm('删除该会话的后台正文？本地记录保留，此会话将停止同步。')) void syncAction('delete', row.sessionId); }}>删除后台正文</button>}
      </div>)}
      {syncError && <p role="alert">{syncError}</p>}
    </section>}
    {error && <p role="alert" style={{ color: 'var(--dsw-alias-state-error-primary)' }}>{error}</p>}
  </section>;
}
export const name = 'workdsh-enterprise-identity-client';
export const inject = ['slots'];
export function apply(ctx: Context): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'workdsh-enterprise-account', label: '企业账号', order: 18 }, Account));
}
