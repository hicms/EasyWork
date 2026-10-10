import { useEffect, useRef, useState, type ReactNode } from 'react';
import { updatePath, type UpdateRow, type UpdateStatus, type UpdateView } from '../../updates/contracts.js';

const labels: Record<UpdateStatus, string> = { unchecked: '尚未检查', latest: '已是最新', available: '可更新', incompatible: '不兼容', 'check-failed': '检查失败', 'no-source': '未配置更新源', updating: '更新中', 'restart-required': '需要重启', updated: '已生效', 'update-failed': '更新失败', cancelled: '已取消' };
async function request(body: Record<string, unknown>): Promise<UpdateView> {
  const response = await fetch(updatePath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '操作失败');
  return result;
}
const button = { padding: '7px 14px', border: '1px solid var(--dsw-alias-border-primary, #8885)', borderRadius: 8, cursor: 'pointer', background: 'var(--dsw-alias-background-primary, transparent)', color: 'inherit' };
export function PluginUpdates({ view }: { view: 'summary' | 'page' }): ReactNode {
  return view === 'summary' ? <span>查看插件版本，检查并手动更新</span> : <UpdatesPage />;
}
function UpdatesPage(): ReactNode {
  const [data, setData] = useState<UpdateView>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<UpdateRow>();
  const [url, setUrl] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    active.current = true;
    void request({ action: 'list' }).then(value => { if (active.current) { setData(value); setUrl(value.center?.url ?? ''); setPublicKey(value.center?.publicKey ?? ''); } }).catch(() => { if (active.current) setError('无法读取插件版本。'); });
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    if (!data?.busy) return;
    let stopped = false;
    const timer = window.setInterval(() => {
      if (inFlight.current) return;
      inFlight.current = true;
      void request({ action: 'list' }).then(value => { if (!stopped) setData(value); }).catch(() => { if (!stopped) setError('连接中断，更新结果尚未确认。重新连接后核对状态。'); }).finally(() => { inFlight.current = false; });
    }, 1200);
    return () => { stopped = true; clearInterval(timer); };
  }, [data?.busy]);
  async function act(body: Record<string, unknown>) {
    if (pending) return;
    setPending(true); setError('');
    try { const value = await request(body); if (active.current) setData(value); }
    catch (failure) { if (active.current) setError((failure as Error).message); }
    finally { if (active.current) setPending(false); }
  }
  const busy = pending || data?.busy;
  return <section style={{ maxWidth: 1120, margin: '0 auto', padding: '8px 0 32px', color: 'inherit' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div><h2 style={{ margin: '0 0 8px' }}>插件版本与更新</h2><p style={{ margin: 0, opacity: .7 }}>由你检查、确认和更新。不会在启动时联网检查，也不会自动安装。</p></div>
      <button style={button} disabled={busy} onClick={() => void act({ action: 'check' })}>{pending ? '处理中…' : '检查更新'}</button>
    </div>
    <p style={{ opacity: .7, fontSize: 13 }}>官方 DSH 核心随应用版本锁定。插件更新保留配置和启用状态，安装后需要重启并核对运行状态。</p>
    {error ? <p role="alert" style={{ color: '#d65a43' }}>{error}</p> : null}
    {!data ? <p>正在读取已安装插件…</p> : <div style={{ display: 'grid', gap: 12 }}>
      {data.rows.map(row => <article key={row.name} data-update-plugin={row.name} style={{ padding: 18, border: '1px solid #8884', borderRadius: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <div><strong>{row.title}</strong><span style={{ marginLeft: 12, fontSize: 13, color: ['available', 'updated'].includes(row.status) ? '#32816b' : 'inherit' }}>{labels[row.status]}</span></div>
          {row.status === 'available' ? <button style={button} disabled={busy} onClick={() => setConfirm(row)}>更新</button> : null}
          {row.status === 'updating' ? <button style={button} disabled={pending} onClick={() => void act({ action: 'cancel' })}>取消更新</button> : null}
        </div>
        <div style={{ fontSize: 12, opacity: .6, marginTop: 4, overflowWrap: 'anywhere' }}>{row.name}</div>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, margin: '14px 0 8px', fontSize: 13 }}>
          {([['当前安装', row.currentVersion || '未知'], ['可用版本', row.availableVersion ?? '—'], ['来源', row.source], ['兼容状态', row.compatibility]] as const).map(([label, value]) => <div key={label}><dt style={{ opacity: .6, marginBottom: 4 }}>{label}</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd></div>)}
        </dl>
        <div style={{ fontSize: 13, opacity: .75 }}>{row.enabled ? '已启用' : '已停用'}{row.runningVersion ? ` · 当前运行 ${row.runningVersion}` : ''}{row.message ? ` · ${row.message}` : ''}</div>
      </article>)}
    </div>}
    <details style={{ marginTop: 24 }}><summary style={{ cursor: 'pointer' }}>EasyWork 插件服务中心</summary>
      <p style={{ fontSize: 13, opacity: .75 }}>填写你部署的服务地址和发布公钥。公钥用于验证版本清单；不要填写发布私钥或访问凭据。</p>
      <label style={{ display: 'block' }}>服务地址<input aria-label="插件服务中心地址" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://plugins.example.cn" style={{ display: 'block', width: '100%', margin: '6px 0 12px', padding: 8, background: 'transparent', color: 'inherit', border: '1px solid #8885', borderRadius: 6 }} /></label>
      <label style={{ display: 'block' }}>Ed25519 发布公钥<textarea aria-label="插件服务中心公钥" value={publicKey} onChange={e => setPublicKey(e.target.value)} rows={3} style={{ display: 'block', width: '100%', margin: '6px 0 12px', padding: 8, background: 'transparent', color: 'inherit', border: '1px solid #8885', borderRadius: 6 }} /></label>
      <button style={button} disabled={busy || !url || !publicKey} onClick={() => void act({ action: 'configure', url, publicKey })}>保存更新源</button>
    </details>
    {confirm ? <div role="dialog" aria-modal="true" aria-label="确认插件更新" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', background: '#0008', padding: 24 }}>
      <div style={{ background: 'var(--dsw-alias-background-primary, #fff)', color: 'var(--dsw-alias-text-primary, #222)', borderRadius: 16, padding: 24, width: 'min(580px, 100%)', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 16px 64px #0005' }}>
        <h3 style={{ marginTop: 0 }}>更新 {confirm.title}</h3><p>{confirm.currentVersion} → <strong>{confirm.availableVersion}</strong></p>
        <p>将安装本次检查锁定的版本及校验包。更新后需退出并重新启动应用。</p>
        <h4>更新说明</h4><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{confirm.notes}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button autoFocus style={button} onClick={() => setConfirm(undefined)}>取消</button>
          <button style={button} disabled={busy} onClick={() => { setConfirm(undefined); void act({ action: 'update', name: confirm.name, candidateId: confirm.candidateId }); }}>确认更新到 {confirm.availableVersion}</button></div>
      </div>
    </div> : null}
  </section>;
}
