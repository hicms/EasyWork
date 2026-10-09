import { createHash, randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-api-session-controller';
import { readProtectedFile } from './protected-file.js';
import { DesktopAuthority, DesktopAuthorityError } from './desktop-authority.js';

export interface VisibleEntry { seq: number; recordId: string; role: 'user' | 'assistant'; text: string }
export interface BodySnapshot { version: 1; deviceId: string; sessionId: string; revision: number; requestId: string; entries: VisibleEntry[] }
export interface BodyReceipt { version: 1; sessionId: string; deviceId: string; clientSessionId: string; revision: number; nextRevision: number; recordCount: number; deleted: boolean }
interface SyncSession { entries: VisibleEntry[]; revision: number; acknowledged: number; pending?: BodySnapshot; deleted?: boolean; deletePending?: boolean; error?: string }
interface Outbox { version: 1; namespace: string; sessions: Record<string, SyncSession> }
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const sessionKey = (id: string) => /^[\w-]{1,160}$/.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id);

/** Deliberate visible-text projection. It never serializes a whole DSH event. */
export function redactVisibleText(text: string): string {
  return text.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[credential redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g, '[credential redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[credential redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]{16,}/gi, 'Bearer [credential redacted]');
}
export function visibleEntries(events: readonly SessionEvent[], namespace: string, sessionId: string): VisibleEntry[] {
  const entries: VisibleEntry[] = [];
  for (const event of events) {
    const role = event.type === 'user/message' && event.data.source.kind === 'user' ? 'user'
      : event.type === 'assistant/message' ? 'assistant' : undefined;
    if (!role) continue;
    const content = event.type === 'user/message' ? event.data.content
      : event.type === 'assistant/message' ? event.data.message.content : [];
    const text = redactVisibleText(content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n'));
    if (!text.trim()) continue;
    entries.push({ seq: entries.length, recordId: digest(JSON.stringify([namespace, sessionId, event.seq, role])), role, text });
  }
  if (entries.length > 512 || entries.some(entry => Buffer.byteLength(entry.text) > 65536) ||
      entries.reduce((bytes, entry) => bytes + Buffer.byteLength(entry.text), 0) > 262144)
    throw new Error('可见正文超过同步上限；本地记录已保留，未截断上传。');
  return entries;
}

/** Durable, serial append-only outbox; official local persistence remains its own owner. */
export class DesktopBodySync {
  private state!: Outbox;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly lifetime = new AbortController();
  readonly file: string;
  private constructor(private readonly authority: DesktopAuthority,
    private readonly inspect: (id: SessionId, signal: AbortSignal) => Promise<{ events: readonly SessionEvent[] }>) {
    this.file = join(dirname(authority.config.authFile), 'enterprise-visible-sync.json');
  }
  static async create(authority: DesktopAuthority, inspect: DesktopBodySync['inspect']): Promise<DesktopBodySync> {
    await authority.verify();
    const sync = new DesktopBodySync(authority, inspect);
    sync.state = { version: 1, namespace: authority.namespace, sessions: {} };
    try {
      const state = JSON.parse(await readProtectedFile(sync.file, 32 * 1024 * 1024)) as Outbox;
      if (state.version !== 1 || state.namespace !== authority.namespace || !state.sessions || typeof state.sessions !== 'object' || Array.isArray(state.sessions)) throw new Error('Enterprise sync outbox owner mismatch');
      for (const [id, session] of Object.entries(state.sessions)) {
        if (!sessionKey(id) || !Array.isArray(session.entries) || !Number.isSafeInteger(session.revision) || session.revision < 0 ||
            !Number.isSafeInteger(session.acknowledged) || session.acknowledged < 0 || session.acknowledged > session.entries.length ||
            session.entries.some((entry, seq) => entry.seq !== seq || !/^[a-f0-9]{64}$/.test(entry.recordId) || !['user', 'assistant'].includes(entry.role) || typeof entry.text !== 'string'))
          throw new Error('Enterprise sync outbox invalid');
        if (session.pending && (session.pending.deviceId !== authority.config.deviceId || session.pending.sessionId !== id || session.pending.revision !== session.revision + 1 ||
            session.pending.version !== 1 || typeof session.pending.requestId !== 'string' || !Array.isArray(session.pending.entries) ||
            JSON.stringify(session.pending.entries) !== JSON.stringify(session.entries.slice(0, session.pending.entries.length)))) throw new Error('Enterprise sync pending request invalid');
      }
      sync.state = state;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return sync;
  }
  close(): void { this.lifetime.abort(); }
  drain(): Promise<unknown> { return this.chain; }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const work = this.chain.then(() => { this.lifetime.signal.throwIfAborted(); return operation(); });
    this.chain = work.catch(() => {}); return work;
  }
  private async save(): Promise<void> {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify(this.state)); await file.sync(); } finally { await file.close(); }
      await rename(temporary, this.file);
    } finally { await rm(temporary, { force: true }); }
  }
  private receipt(value: unknown, id: string): BodyReceipt {
    const receipt = value as BodyReceipt;
    if (!receipt || receipt.version !== 1 || !/^desktop-body:/.test(receipt.sessionId) || receipt.clientSessionId !== id || receipt.deviceId !== this.authority.config.deviceId ||
        !Number.isSafeInteger(receipt.revision) || receipt.revision < 0 || receipt.nextRevision !== receipt.revision + 1 ||
        !Number.isSafeInteger(receipt.recordCount) || receipt.recordCount < 0 || typeof receipt.deleted !== 'boolean') throw new Error('正文同步响应无效。');
    return receipt;
  }
  private async send(id: string, session: SyncSession): Promise<void> {
    if (session.deleted || (!session.pending && session.entries.length === session.acknowledged)) return;
    if (!session.pending) {
      session.pending = { version: 1, deviceId: this.authority.config.deviceId, sessionId: id,
        revision: session.revision + 1, requestId: randomUUID(), entries: session.entries.map(entry => ({ ...entry })) };
      await this.save(); // Durable request identity precedes the network write.
    }
    const pending = session.pending;
    const receipt = this.receipt(await this.authority.body('POST', id, pending, this.lifetime.signal), id);
    if (receipt.deleted || receipt.revision !== pending.revision || receipt.recordCount !== pending.entries.length) throw new Error('正文同步确认与本机请求不一致。');
    session.revision = receipt.revision; session.acknowledged = receipt.recordCount; delete session.pending; delete session.error;
    await this.save();
    if (session.entries.length > session.acknowledged) await this.send(id, session);
  }
  capture(id: string): Promise<void> { return this.enqueue(() => this.captureSession(id)); }
  private async captureSession(id: string): Promise<void> {
    if (!sessionKey(id)) throw new Error('Invalid Desktop Session identity');
    let session = this.state.sessions[id];
    if (session?.deleted || session?.deletePending) return;
    try {
      await this.authority.verify(this.lifetime.signal);
      // The shared access bridge verifies the current fixed member and real Session ownership before and after the cold read.
      const inspected = await this.inspect(id as SessionId, this.lifetime.signal);
      await this.authority.verify(this.lifetime.signal);
      const entries = visibleEntries(inspected.events, this.state.namespace, id).map(entry => ({ ...entry, text: this.authority.redactProtectedText(entry.text) }));
      if (!entries.length) return;
      session ??= this.state.sessions[id] = { entries: [], revision: 0, acknowledged: 0 };
      if (session.entries.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(entries[index]))) throw new Error('本机正文记录前缀改变；未覆盖后台记录。');
      session.entries = entries; delete session.error; await this.save(); await this.send(id, session);
    } catch (error) {
      session ??= this.state.sessions[id] = { entries: [], revision: 0, acknowledged: 0 };
      // Backend body errors carry no submitted text or credentials; authentication and network errors stay generic.
      session.error = error instanceof DesktopAuthorityError ? `同步未确认${error.status ? `（${error.status}）` : ''}，请检查企业登录和网络后重试。`
        : error instanceof Error && /^[\u4e00-\u9fff]/.test(error.message) ? error.message : '同步未确认，请检查企业登录和网络后重试。';
      if (error instanceof DesktopAuthorityError && error.status === 410) { session.deleted = true; session.entries = []; session.acknowledged = 0; delete session.pending; }
      await this.save();
    }
  }
  retry(): Promise<void> {
    return this.enqueue(async () => {
      await this.authority.verify(this.lifetime.signal);
      for (const [id, session] of Object.entries(this.state.sessions)) {
        try { if (session.deletePending) { await this.confirmDeletion(id, session); continue; } if (session.pending) await this.send(id, session); await this.captureSession(id); }
        catch (error) { session.error = '同步未确认，请检查企业登录和网络后重试。'; if (error instanceof DesktopAuthorityError && error.status === 410) { session.deleted = true; session.entries = []; session.acknowledged = 0; delete session.pending; } await this.save(); }
      }
    });
  }
  async status(signal?: AbortSignal) {
    await this.authority.verify(signal);
    return { desktop: true, sessions: Object.entries(this.state.sessions).map(([sessionId, session]) => ({ sessionId,
      recordCount: session.entries.length, acknowledged: session.acknowledged, revision: session.revision,
      pending: !!session.deletePending || !!session.pending || session.entries.length > session.acknowledged, deletePending: !!session.deletePending, deleted: !!session.deleted, error: session.error ?? null })) };
  }
  private async confirmDeletion(id: string, session: SyncSession): Promise<BodyReceipt> {
    const receipt = this.receipt(await this.authority.body('DELETE', id, undefined, this.lifetime.signal), id);
    if (!receipt.deleted) throw new Error('后台删除未确认。');
    session.deleted = true; session.entries = []; session.acknowledged = 0; session.revision = receipt.revision;
    delete session.pending; delete session.deletePending; delete session.error;
    await this.save(); return receipt;
  }
  deleteCloud(id: string): Promise<BodyReceipt> {
    return this.enqueue(async () => {
      if (!sessionKey(id) || !this.state.sessions[id]) throw new Error('本机同步会话不存在。');
      const session = this.state.sessions[id]; session.deletePending = true; await this.save();
      try { return await this.confirmDeletion(id, session); }
      catch (error) { session.error = '后台删除未确认；此会话已暂停上传，请重试。'; await this.save(); throw error; }
    });
  }
}

export function observeDesktopSessions(ctx: Context, sync: DesktopBodySync): void {
  // Only committed events are projected; live stream, tools and reasoning never enter the outbox.
  ctx.on('session/created', session => { void sync.capture(String(session.id)).catch(() => {}); });
  ctx.on('session/event', (session, event) => {
    if (event.type === 'user/message' || event.type === 'assistant/message') void sync.capture(String(session.id)).catch(() => {});
  });
  ctx.on('session/flush', session => sync.capture(String(session.id)).catch(() => {}));
  // Disposed is a release/rollback event, not an official deletion contract.
  ctx.effect(() => () => sync.close(), 'workdsh.enterprise-desktop.sync');
  void sync.retry().catch(() => {});
}
