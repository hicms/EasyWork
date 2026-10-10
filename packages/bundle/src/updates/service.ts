import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-plugin-manager';
import { bundleManifest } from '@deepseek-ai/dsh-plugin-manager/operations';
import { withFileLock } from '@deepseek-ai/dsh-atomic-write';
import type {} from '@deepseek-ai/dsh-app-boot';
import semver from 'semver';
import { ownedPlugins, type Candidate, type CenterConfig, type UpdateRow, type UpdateView } from './contracts.js';
import { centerRelease, registryRelease, compatibility, validateCenter, sourceFingerprint, UpdateError } from './sources.js';
import { readState, saveState } from './state.js';
import { installUpdate } from './transaction.js';
import { withReloadQueue } from './exclusive.js';

const titles: Record<string, string> = { 'easywork-plugin-connectors': '连接器', 'easywork-plugin-experts': '专家', 'easywork-plugin-library': '资料库', 'easywork-plugin-projects': '项目', 'easywork-plugin-skills': '技能' };
export class PluginUpdates {
  private readonly processId = randomUUID();
  private readonly processStartedAt = Date.now() - process.uptime() * 1000;
  private readonly candidates = new Map<string, Candidate>();
  private readonly results = new Map<string, Partial<UpdateRow>>();
  private operation?: { name: string; abort: AbortController; done: Promise<void> };
  private checking = false;
  private lastView?: UpdateView;
  private reading?: Promise<UpdateView>;
  private readonly stop = new AbortController();
  constructor(private readonly ctx: Context) {}
  async dispose(): Promise<void> { this.stop.abort(); this.operation?.abort.abort(); await this.operation?.done; }
  private get profile() { return this.ctx.profileContext; }
  private async manifest(): Promise<any> { return JSON.parse(await readFile(join(this.profile.dir, 'package.json'), 'utf8')); }
  private async version(name: string): Promise<string> {
    const state = await readState(this.profile.dir);
    if (state.installed[name]) {
      try { return JSON.parse(await readFile(join(this.profile.dir, 'node_modules', name, 'package.json'), 'utf8')).version; }
      catch { throw new UpdateError('installed', '无法核对个人插件的已安装版本。'); }
    }
    return bundleManifest(name, this.profile.dir, this.profile.installAnchor)?.version ?? '';
  }
  async view(): Promise<UpdateView> {
    // pnpm replaces manifests and directories. Polling must not reopen them mid-transaction.
    if (this.operation && this.lastView) return { ...this.lastView, busy: true,
      rows: this.lastView.rows.map(row => ({ ...row, ...this.results.get(row.name) })) };
    if (!this.reading) this.reading = this.readView().finally(() => { this.reading = undefined; });
    return this.reading;
  }
  private async readView(): Promise<UpdateView> {
    const [bundles, plugins, manifest, state] = await Promise.all([this.ctx.pluginManager.listBundles(), this.ctx.pluginManager.listPlugins(), this.manifest(), readState(this.profile.dir)]);
    const anchor = JSON.parse(await readFile(this.profile.installAnchor, 'utf8'));
    const rows: UpdateRow[] = [];
    for (const bundle of bundles) {
      if (bundle.name.startsWith('@deepseek-ai/')) continue;
      const owned = (ownedPlugins as readonly string[]).includes(bundle.name);
      const record = state.installed[bundle.name];
      const spec = record?.sourceSpec ?? manifest.dependencies?.[bundle.name];
      const registry = typeof spec === 'string' && Boolean(semver.validRange(spec));
      const locked = Boolean(anchor.dependencies?.[bundle.name]) && !owned;
      const source = owned ? (state.center ? 'EasyWork 插件服务中心' : '随应用安装 · 未配置更新源')
        : locked ? '随应用安装 · 由应用版本管理' : registry ? 'Profile 配置的 npm 来源' : '本地文件 / Git / URL · 未配置更新源';
      const noSource = owned ? !state.center : locked || !registry;
      const row: UpdateRow = { name: bundle.name, title: titles[bundle.name] ?? bundle.name, currentVersion: await this.version(bundle.name), enabled: bundle.enabled,
        source, compatibility: bundle.error?.code === 'incompatible-version' ? '当前版本不兼容' : '尚未检查目标版本', status: noSource ? 'no-source' : 'unchecked',
        ...(noSource ? { message: owned ? '配置自建插件服务中心后可检查独立更新。' : '此来源未提供可验证的独立更新协议。' } : {}), ...this.results.get(bundle.name) };
      if (record && !this.operation && !['update-failed', 'cancelled'].includes(row.status)) {
        if (record.process === this.processId || !Number.isFinite(record.installedAt) || this.processStartedAt <= record.installedAt) {
          row.status = 'restart-required'; row.runningVersion = record.process === this.processId ? record.from : undefined;
          row.message = '已核对安装版本；当前进程尚未切换。退出并重新启动应用后生效。';
        }
        else {
          const runtime = plugins.filter(p => bundle.rows.some(r => r.moduleName === p.moduleName));
          const settled = !bundle.enabled || runtime.length > 0 && runtime.every(p => !p.enabled || p.fiberPhase === 'active');
          row.runningVersion = bundle.version;
          if (bundle.version === record.version && settled) { if (!this.results.has(bundle.name)) row.status = 'updated'; row.message ??= bundle.enabled ? '已重启，实际解析版本与运行状态已核对。' : '已安装并保留停用状态。'; }
          else { row.status = 'update-failed'; row.message = '已安装版本与运行状态尚未一致，请检查官方插件详情。'; }
        }
      }
      rows.push(row);
    }
    const view = { rows, busy: this.checking || Boolean(this.operation), center: state.center };
    this.lastView = view;
    return view;
  }
  async configure(config: CenterConfig): Promise<void> {
    if (this.operation || this.checking) throw new UpdateError('busy', '请等待当前检查或更新完成。');
    const validated = validateCenter(config);
    await withFileLock(join(this.profile.dir, 'package.json'), async () => { const state = await readState(this.profile.dir); state.center = validated; await saveState(this.profile.dir, state); }, { waitMs: 1000 });
    this.candidates.clear(); this.results.clear();
  }
  async check(): Promise<void> {
    if (this.checking || this.operation) throw new UpdateError('busy', '已有检查或更新正在进行。');
    this.checking = true;
    try {
      const { rows } = await this.view(); const state = await readState(this.profile.dir); const manifest = await this.manifest();
      for (const row of rows) {
        if (['no-source', 'restart-required'].includes(row.status)) continue;
        this.candidates.delete(row.name); this.results.delete(row.name);
        try {
          const owned = (ownedPlugins as readonly string[]).includes(row.name);
          const fingerprint = await sourceFingerprint(this.profile, row.name);
          if (JSON.stringify(state.center) !== JSON.stringify((await readState(this.profile.dir)).center)) throw new UpdateError('stale', '更新源已改变，请重新检查。');
          const signal = AbortSignal.any([this.stop.signal, AbortSignal.timeout(20000)]);
          const release = owned ? await centerRelease(state.center!, row.name, signal) : await registryRelease(this.profile, row.name, signal);
          if (fingerprint !== await sourceFingerprint(this.profile, row.name)) throw new UpdateError('stale', '检查期间来源发生变化，请重新检查。');
          const mismatch = compatibility(release.manifest);
          const base: Partial<UpdateRow> = { availableVersion: release.version, notes: release.notes ?? '此版本未提供更新说明。', compatibility: mismatch ?? '声明与当前 DSH 兼容；安装时还会核对实际组件' };
          if (mismatch) this.results.set(row.name, { ...base, status: 'incompatible', message: mismatch });
          else if (!semver.gt(release.version, row.currentVersion)) this.results.set(row.name, { ...base, status: 'latest', message: '当前来源未提供更高版本。' });
          else {
            const candidate: Candidate = { ...release, id: randomUUID(), from: row.currentVersion, expires: Date.now() + 15 * 60000, source: owned ? 'center' : 'registry',
              sourceSpec: owned ? undefined : state.installed[row.name]?.sourceSpec ?? manifest.dependencies[row.name], sourceFingerprint: fingerprint };
            this.candidates.set(row.name, candidate);
            this.results.set(row.name, { ...base, status: 'available', candidateId: candidate.id });
          }
        } catch (error) { this.results.set(row.name, { status: 'check-failed', compatibility: '未能完成检查', message: error instanceof UpdateError ? error.message : '检查失败，请重试。' }); }
      }
    } finally { this.checking = false; }
  }
  async update(name: string, id: string): Promise<void> {
    if (this.operation || this.checking) throw new UpdateError('busy', '已有检查或更新正在进行，请勿重复提交。');
    const candidate = this.candidates.get(name);
    if (!candidate || candidate.id !== id || candidate.expires < Date.now()) throw new UpdateError('stale', '更新确认已过期，请重新检查。');
    const abort = new AbortController();
    this.results.set(name, { ...this.results.get(name), status: 'updating', message: '正在校验并更新，可取消。' });
    const operation = { name, abort, done: Promise.resolve() };
    this.operation = operation;
    const hmr = this.ctx.get('hmr') as { runExclusive<T>(operation: () => Promise<T>): Promise<T> } | undefined;
    const signal = AbortSignal.any([abort.signal, this.stop.signal]);
    operation.done = (this.reading ?? Promise.resolve()).then(() => installUpdate({ profile: this.profile, candidate, processId: this.processId, subprocess: this.ctx.subprocess, signal,
      currentVersion: () => this.version(name), sourceIsCurrent: async () => candidate.sourceFingerprint === await sourceFingerprint(this.profile, name),
      runExclusive: work => withReloadQueue(hmr, work, signal),
    })).then(() => { this.results.set(name, { status: 'restart-required', compatibility: '安装校验通过' }); }).catch(error => {
      this.results.set(name, { status: abort.signal.aborted && !(error instanceof UpdateError && error.code === 'recovery') ? 'cancelled' : 'update-failed',
        message: error instanceof UpdateError ? error.message : abort.signal.aborted ? '更新已取消，旧版保持可用。' : '更新失败，未确认新版生效。请重新检查。' });
    }).finally(() => { this.candidates.delete(name); this.operation = undefined; });
  }
  async cancel(): Promise<void> { const operation = this.operation; operation?.abort.abort(); await operation?.done; }
}
