import * as React from 'react';
import type { ModelsClient } from './management.ts';
import { ModelList } from './ModelList.tsx';
import { styles } from './styles.ts';

export function AccountModels({ account }: { account: ModelsClient }) {
  const state = React.useSyncExternalStore(account.subscribe, account.getSnapshot, account.getSnapshot);
  const [search, setSearch] = React.useState('');
  const snapshot = state.snapshot;
  React.useEffect(() => { void account.refresh().catch(() => {}); }, [account]);
  const login = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const password = String(data.get('password') ?? ''); const email = String(data.get('email') ?? '');
    const input = form.elements.namedItem('password'); if (input instanceof HTMLInputElement) input.value = '';
    void account.login(email, password).catch(() => {});
  };
  return <section className="easywork-models"><style>{styles}</style><h2>EasyWork 账号与模型</h2><p>登录后即可使用账号可访问的模型。</p>
    <div className="ew-card">{snapshot.user ? <div className="ew-heading"><div><strong>{snapshot.user.email}</strong><div className="ew-caption">已登录 · {snapshot.models.length} 个模型</div></div>
      <button type="button" className="ew-button" disabled={state.busy} onClick={() => { void account.logout().catch(() => {}); }}>退出登录</button></div>
      : <form className="ew-login" onSubmit={login}><label>邮箱<input name="email" type="email" autoComplete="username" required disabled={state.busy} /></label>
        <label>密码<input name="password" type="password" autoComplete="current-password" required disabled={state.busy} /></label>
        <button className="ew-button ew-primary" type="submit" disabled={state.busy}>{state.busy ? '正在登录…' : '登录'}</button></form>}
      {(state.error ?? snapshot.error) ? <p role="alert" className="ew-error">{state.error ?? snapshot.error}</p> : null}
    </div>
    {snapshot.user ? <div className="ew-card"><div className="ew-heading"><h3>模型</h3><button type="button" className="ew-button" disabled={state.busy} onClick={() => { void account.refresh(true).catch(() => {}); }}>{state.busy ? '加载中…' : '刷新列表'}</button></div>
      <p className="ew-caption">模型由服务管理；在会话中选择模型和思考参数。</p>
      <input className="ew-search" type="search" aria-label="搜索模型" placeholder="搜索模型或厂商" value={search} onChange={event => setSearch(event.target.value)} />
      <ModelList models={snapshot.models} search={search} />
    </div> : null}
  </section>;
}
