import { deepFreeze } from '@deepseek-ai/dsh-util-values';
import { Context } from '@deepseek-ai/cordis';
import { randomUUID } from 'node:crypto';
import { SessionId, SessionLogOffset, type SessionHeader, type SessionEvent } from '@deepseek-ai/dsh-session';
import { SessionPersistence, SessionPersistenceRevision, materializeCreateHeader, materializeAppendBatch, assertVersion, assertStoredId, assertContiguous, validateStoredEvents,
 SessionAlreadyExistsError, SessionAlreadyOwnedError, SessionPersistenceNotFoundError, SessionOwnershipLostError, SessionReadOnlyError, SessionHandleClosedError,
 type SessionHandle, type SessionAccess, type SessionPersistenceCreateOptions, type SessionPersistenceOpenOptions, type SessionPersistenceStatOptions, type SessionPersistenceListOptions, type SessionPersistenceSnapshot } from '@deepseek-ai/dsh-session-persistence';
export interface EnterpriseDatabaseSessionsOptions {
 backendUrl: string;
 serviceKey: string;
 authorization(): Promise<string>;
 verify(): Promise<void>;
}
type Snapshot = { header: SessionHeader; inheritedEventCount: number; eventCount: number };
type Opened = { snapshot: Snapshot; writerId: string | null };
/** Internal official persistence provider. Session format and replay validation stay in DSH. */
export class EnterpriseDatabaseSessions extends SessionPersistence {
 private readonly endpoint: URL;
 private readonly revisionSource = randomUUID();
 private readonly handles = new Set<SessionHandle>();
 private closed = false;
 private readonly writers = new Map<SessionId, SessionHandle>();
 private readonly liveFailures = new Map<SessionId, unknown>();
 /** Public DSH event contract, mounted only in the authenticated member runtime scope. */
 installLiveRouting(ctx: Context): void {
  ctx.on('session/event', (session, event) => {
   const writer = this.writers.get(session.id);
   if (writer) void writer.append([event]).catch(error => { this.liveFailures.set(session.id, error); });
  });
  ctx.on('session/flush', session => this.writers.get(session.id)?.flush());
  ctx.on('session/disposed', session => {
   const writer = this.writers.get(session.id);
   if (writer) void writer.close().catch(error => { this.liveFailures.set(session.id, error); });
  });
 }

 constructor(ctx: Context, private readonly options: EnterpriseDatabaseSessionsOptions) {
  super(ctx);
  const url = new URL(options.backendUrl);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || options.serviceKey.length < 32) throw new Error('Invalid enterprise database configuration');
  this.endpoint = new URL('/api/internal/member-sessions', url);
  ctx.effect(() => async () => { this.closed = true; await Promise.allSettled([...this.handles].map(h => h.close())); });
 }
 private async request(operation: string, id?: SessionId, extra: object = {}, signal?: AbortSignal): Promise<any> {
  signal?.throwIfAborted();await this.options.verify();
  const authorization = await this.options.authorization();
  if (!/^Bearer [A-Za-z0-9_-]{16,512}$/.test(authorization)) throw new Error('Invalid member authentication');
  const response = await fetch(this.endpoint, { method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
   headers: { 'content-type': 'application/json', Authorization: authorization, 'X-WorkDSH-Service-Key': this.options.serviceKey }, body: JSON.stringify({ operation, id, ...extra }) });
  await this.options.verify();
  if (response.status === 404 && id) throw new SessionPersistenceNotFoundError(id);
  if (response.status === 409 && id) {
   if (operation === 'create') throw new SessionAlreadyExistsError(id);
   if (operation === 'open-write') throw new SessionAlreadyOwnedError(id);
   throw new SessionOwnershipLostError(id);
  }
  if (!response.ok) throw new Error(`Enterprise session storage rejected (${response.status})`);
  const text = await response.text(); const result = text ? JSON.parse(text) : undefined;
  await this.options.verify(); return result;
 }
 private snapshot(value: Snapshot): SessionPersistenceSnapshot {
  const header = deepFreeze(materializeCreateHeader(value.header)); assertVersion(header);
  if (!Number.isSafeInteger(value.eventCount) || value.eventCount < 0 || !Number.isSafeInteger(value.inheritedEventCount) || value.inheritedEventCount < 0 || (!header.isSeeded && value.inheritedEventCount !== 0)) throw new Error('Invalid stored session metadata');
  return { header, eventCount: value.eventCount, revision: SessionPersistenceRevision(`${this.revisionSource}:${header.id}:${value.eventCount}`) };
 }
 async create(input: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle> {
  if (this.closed) throw new Error('Enterprise session storage closed');
  const header = materializeCreateHeader(input); assertVersion(header);
  const inherited = options?.inheritedEventCount ?? 0;
  if (!Number.isSafeInteger(inherited) || inherited < 0 || (header.isSeeded && options?.inheritedEventCount === undefined) || (!header.isSeeded && inherited !== 0)) throw new Error('Invalid inherited event count');
  const opened: Opened = await this.request('create', header.id, { header, inheritedEventCount: inherited }, options?.signal);
  return this.handle(header.id, 'write', opened);
 }
 async open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle> {
  if (this.closed) throw new Error('Enterprise session storage closed');
  if (access !== 'write' && access !== 'read') throw new Error('Invalid session access');
  const opened: Opened = await this.request(`open-${access}`, id, {}, options?.signal);
  try { return this.handle(id, access, opened); }
  catch (error) { if (opened.writerId) await this.request('close', id, { writerId: opened.writerId }).catch(() => {}); throw error; }
 }
 async stat(id: SessionId, options?: SessionPersistenceStatOptions): Promise<SessionPersistenceSnapshot | undefined> {
  if (this.closed) throw new Error('Enterprise session storage closed');
  try { const value: Snapshot = await this.request('stat', id, {}, options?.signal); const result = this.snapshot(value); assertStoredId(id, result.header); return result; }
  catch (error) { if (error instanceof SessionPersistenceNotFoundError) return undefined; throw error; }
 }
 async list(options?: SessionPersistenceListOptions): Promise<readonly SessionPersistenceSnapshot[]> {
  if (this.closed) throw new Error('Enterprise session storage closed');
  const values: Snapshot[] = await this.request('list', undefined, {}, options?.signal);return values.map(value => this.snapshot(value));
 }
 async flush(): Promise<void> {
  const results = await Promise.allSettled([...this.handles].filter(h => h.access === 'write').map(h => h.flush()));
  const errors = results.flatMap(r => r.status === 'rejected' ? [r.reason] : []);if (errors.length) throw new AggregateError(errors, 'Enterprise session flush failed');
 }
 private handle(id: SessionId, access: SessionAccess, opened: Opened): SessionHandle {
  const header = this.snapshot(opened.snapshot).header;assertStoredId(id, header);
  if (access === 'write' && !opened.writerId) throw new Error('Missing session writer ownership');
  let closed = false, lost = false, closing: Promise<void> | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(operation: string, body: () => Promise<T>): Promise<T> => {
   if (closed || this.closed) return Promise.reject(new SessionHandleClosedError(id, operation));
   const work = chain.then(body);chain = work.catch(() => {});return work;
  };
  const writer = (operation: string) => { if (access !== 'write') throw new SessionReadOnlyError(id, operation);if (lost) throw new SessionOwnershipLostError(id); };
  const flush = (signal?: AbortSignal) => enqueue('flush', async () => { writer('flush');if (this.liveFailures.has(id)) throw this.liveFailures.get(id);try { await this.request('flush', id, { writerId: opened.writerId }, signal); } catch (error) { lost = true;throw error; } });
  const timer = access === 'write' ? setInterval(() => { void flush().catch(() => { lost = true; }); }, 20_000) : undefined;
  timer?.unref();
  const handle: SessionHandle = {
   id, header, inheritedEventCount: SessionLogOffset(opened.snapshot.inheritedEventCount), access,
   read: (offset = 0, length = Infinity, options) => enqueue('read', async () => {
    if (!Number.isSafeInteger(offset) || offset < 0 || (length !== Infinity && (!Number.isSafeInteger(length) || length < 0))) throw new Error('Invalid session slice');
    const state: Snapshot = await this.request('stat', id, {}, options?.signal);this.snapshot(state);assertStoredId(id, state.header);
    const events: SessionEvent[] = [];
    while (events.length < state.eventCount) {
     const batch: SessionEvent[] = await this.request('read', id, { offset: events.length, length: Math.min(10000, state.eventCount - events.length) }, options?.signal);
     if (!Array.isArray(batch) || !batch.length) throw new Error('Incomplete stored session log');events.push(...batch);
    }
    assertContiguous(id, events, 0);validateStoredEvents(header, events);
    return { events: events.slice(offset, length === Infinity ? undefined : offset + length), eventState: 'shared-frozen' as const };
   }),
   append: (input, options) => {
    const events = materializeAppendBatch(input);
    return enqueue('append', async () => { writer('append');const state: Snapshot = await this.request('stat', id, {}, options?.signal);assertContiguous(id, events, state.eventCount);
     validateStoredEvents(header, [...events]);
     try { await this.request('append', id, { writerId: opened.writerId, events }, options?.signal); } catch (error) { lost = true;throw error; }
    });
   },
   flush: options => flush(options?.signal),
   close: () => closing ??= (async () => { closed = true;if (timer) clearInterval(timer);await chain;try { if (access === 'write') await this.request('close', id, { writerId: opened.writerId }); } finally { this.handles.delete(handle);if (this.writers.get(id) === handle) this.writers.delete(id); } })(),
   [Symbol.asyncDispose]: () => handle.close(),
  };
  this.handles.add(handle);if (access === 'write') { this.liveFailures.delete(id);this.writers.set(id, handle); }return handle;
 }
}
