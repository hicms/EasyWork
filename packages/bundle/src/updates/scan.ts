import { constants } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, readdir, readlink, stat, symlink } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

/** One shared I/O budget per scan; queued work inherits the released slot. */
export function limitedIo(limit = 16) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    if (active < limit) active++;
    else await new Promise<void>(resolve => waiting.push(resolve));
    try { return await operation(); }
    finally {
      const next = waiting.shift();
      if (next) next(); else active--;
    }
  };
}

/** A failed scan must release every file handle before restoration may begin. */
export async function drainedAll<T>(operations: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(operations);
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
  return results.map(result => (result as PromiseFulfilledResult<T>).value);
}
/** Copy the actual tree without following links, draining all I/O on cancellation. */
export async function copyTree(source: string, target: string, signal?: AbortSignal, knownLinks?: Map<string, 'dir' | 'file'>): Promise<Map<string, 'dir' | 'file'>> {
  const io = limitedIo();
  const links = new Map<string, 'dir' | 'file'>();
  async function visit(from: string, to: string, kind: 'directory' | 'link' | 'file'): Promise<void> {
    signal?.throwIfAborted();
    if (kind === 'link') {
      const key = relative(source, from);
      const type = knownLinks?.get(key) ?? ((await io(() => stat(from))).isDirectory() ? 'dir' : 'file');
      links.set(key, type);
      const destination = await io(() => readlink(from));
      await io(() => symlink(destination, to, process.platform === 'win32' && type === 'dir' && isAbsolute(destination) ? 'junction' : type));
    } else if (kind === 'file') {
      await io(() => copyFile(from, to, constants.COPYFILE_EXCL));
    } else {
      const info = await io(() => lstat(from));
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Snapshot directory changed');
      await io(() => mkdir(to, { mode: info.mode | 0o700 }));
      const entries = await io(() => readdir(from, { withFileTypes: true }));
      for (let start = 0; start < entries.length; start += 8) await drainedAll(entries.slice(start, start + 8).map(async entry => {
        if (!entry.isSymbolicLink() && !entry.isDirectory() && !entry.isFile()) throw new Error('Unsupported dependency filesystem entry');
        await visit(join(from, entry.name), join(to, entry.name), entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'directory' : 'file');
      }));
      await io(() => chmod(to, info.mode));
    }
  }
  await visit(source, target, 'directory');
  return links;
}
