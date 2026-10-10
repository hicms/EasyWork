interface ReloadQueue { runExclusive<T>(operation: () => Promise<T>): Promise<T> }

/** A reload may dispose this service while its update is still queued behind that reload. */
export function withReloadQueue(queue: ReloadQueue | undefined, work: () => Promise<void>, signal: AbortSignal): Promise<void> {
  if (!queue) return work();
  return new Promise((resolve, reject) => {
    let entered = false;
    const abort = () => { if (!entered) reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void Promise.resolve().then(() => queue.runExclusive(async () => {
      signal.throwIfAborted();
      entered = true;
      signal.removeEventListener('abort', abort);
      // Once entered, retain the package lock until work and any rollback have drained.
      await work();
    })).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
