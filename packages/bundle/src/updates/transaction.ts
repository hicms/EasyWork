import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, readlink, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { withFileLock, writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import { bundlePatchPaths, evaluatePluginCompatibility, getDshRuntimeVersion, loadOverlayPatches, type ProfileContext } from '@deepseek-ai/dsh-app-boot';
import { runProfilePnpm } from '@deepseek-ai/dsh-plugin-manager/operations';
import { compatibility, downloadRelease, UpdateError } from './sources.js';
import { readState, saveState, stateFile } from './state.js';
import type { Candidate } from './contracts.js';
import { validateInstalledRuntime } from './runtime-check.js';
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import { copyTree, drainedAll, limitedIo } from './scan.js';

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
async function treeDigest(root: string, signal?: AbortSignal): Promise<string> {
  const io = limitedIo();
  async function visit(path: string, kind: 'directory' | 'link' | 'file'): Promise<string> {
    signal?.throwIfAborted();
    const digest = createHash('sha256').update(kind);
    if (kind === 'link') digest.update(await io(() => readlink(path)));
    else if (kind === 'file') digest.update(await io(() => readFile(path)));
    else {
      const entries = (await io(() => readdir(path, { withFileTypes: true }))).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      // Bound each batch, keep deterministic ordering, and yield cancellation between files.
      for (let start = 0; start < entries.length; start += 8) {
        const batch = entries.slice(start, start + 8);
        const hashes = await drainedAll(batch.map(entry => visit(join(path, entry.name), entry.isSymbolicLink() ? 'link' : entry.isDirectory() ? 'directory' : 'file')));
        for (let index = 0; index < batch.length; index++) digest.update(JSON.stringify(batch[index]!.name)).update(hashes[index]!);
      }
    }
    return digest.digest('hex');
  }
  return await exists(root) ? visit(root, 'directory') : createHash('sha256').digest('hex');
}
async function corePackages(root: string, before?: Map<string, number>, signal?: AbortSignal): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const io = limitedIo();
  async function visit(path: string): Promise<void> {
    signal?.throwIfAborted();
    const entries = await io(() => readdir(path, { withFileTypes: true }));
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.name === 'package.json' && entry.isFile()) {
        const manifest = JSON.parse(await io(() => readFile(child, 'utf8')));
        if (manifest.name === '@deepseek-ai/dsh' || manifest.name?.startsWith('@deepseek-ai/dsh-') || ['@deepseek-ai/cordis', '@deepseek-ai/schemastery'].includes(manifest.name)) {
          const key = manifest.name + '@' + manifest.version;
          counts.set(key, (counts.get(key) ?? 0) + 1);
          if (before && counts.get(key)! > (before.get(key) ?? 0)) throw new UpdateError('core', '插件不得新增或替换锁定的 DSH 核心依赖副本。');
        }
        if (before && manifest.dsh && evaluatePluginCompatibility(manifest)) throw new UpdateError('incompatible', '包内组件与当前 DSH 不兼容。');
      }
    }
    const directories = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink());
    for (let start = 0; start < directories.length; start += 8) await drainedAll(directories.slice(start, start + 8).map(entry => visit(join(path, entry.name))));
  }
  if (await exists(root)) await visit(root);
  return counts;
}
export interface TransactionOptions {
  profile: ProfileContext; candidate: Candidate; processId: string; signal: AbortSignal;
  currentVersion: () => Promise<string>; sourceIsCurrent: () => Promise<boolean>;
  subprocess: SubprocessRuntime;
  runExclusive?: (operation: () => Promise<void>) => Promise<void>;
}
/** Official pnpm + official Profile lock, with offline restoration of the actual tree on every rejected operation. */
export async function installUpdate(options: TransactionOptions): Promise<void> {
  const { profile, candidate, signal } = options;
  const mismatch = compatibility(candidate.manifest);
  if (mismatch) throw new UpdateError('incompatible', mismatch);
  const archive = await downloadRelease(candidate, join(profile.dir, '.easywork-updates', 'archives'), signal);
  await withFileLock(join(profile.dir, 'package.json'), async () => {
    const operation = async () => {
    signal.throwIfAborted();
    if (await options.currentVersion() !== candidate.from || !await options.sourceIsCurrent()) throw new UpdateError('stale', '插件或更新源已改变，请重新检查更新。');
    const manifestPath = join(profile.dir, 'package.json');
    const before = JSON.parse(await readFile(manifestPath, 'utf8'));
    const modules = join(profile.dir, 'node_modules');
    if (await exists(modules) && (await lstat(modules)).isSymbolicLink()) throw new UpdateError('profile', '此 Profile 依赖目录是共享链接，不能安全更新。');
    const backup = join(profile.dir, '.easywork-updates', 'transactions', randomUUID());
    await mkdir(backup, { recursive: true, mode: 0o700 });
    const files = new Map<string, Buffer | undefined>();
    for (const name of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', stateFile]) {
      files.set(name, await exists(join(profile.dir, name)) ? await readFile(join(profile.dir, name)) : undefined);
    }
    for (const [name, contents] of files) if (contents !== undefined) await writeFile(join(backup, name), contents, { mode: 0o600 });
    const hadModules = await exists(modules);
    const originalCore = await corePackages(modules, undefined, signal);
    const otherPackages = new Map<string, string>();
    for (const name of Object.keys(before.dependencies ?? {})) {
      if (name !== candidate.name && await exists(join(modules, name))) otherPackages.set(name, await treeDigest(await realpath(join(modules, name)), signal));
    }
    const beforeDigest = await treeDigest(modules, signal);
    let originalLinks: Map<string, 'dir' | 'file'> | undefined;
    try {
      if (hadModules) originalLinks = await copyTree(modules, join(backup, 'node_modules'), signal);
      await writeFile(join(backup, 'link-types.json'), JSON.stringify(Object.fromEntries(originalLinks ?? [])), { mode: 0o600 });
      if (await treeDigest(join(backup, 'node_modules'), signal) !== beforeDigest) throw new Error('Incomplete dependency snapshot');
      signal.throwIfAborted();
    } catch (error) { await rm(backup, { recursive: true, force: true }); throw error; }
    try {
      const result = await runProfilePnpm({ ...profile, profile: profile.name }, ['add', archive, '--ignore-scripts', '--config.fetch-retries=0'], {
        ...profile.packageManager, execution: 'service', signal, outputBytes: 4096, idleTimeoutMs: 60000, lookupTimeoutMs: 15000, activateNewBundles: false,
      });
      signal.throwIfAborted();
      if (result.exitCode !== 0 || result.timedOut) throw new UpdateError(result.incompatible ? 'incompatible' : 'install', '官方包操作未成功，已恢复原版本及依赖。');
      const path = join(modules, candidate.name);
      const installed = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
      if (installed.name !== candidate.name || installed.version !== candidate.version || compatibility(installed)) throw new UpdateError('manifest', '实际安装包与已确认版本或兼容要求不符。');
      for (const field of ['dsh', 'dependencies', 'optionalDependencies', 'peerDependencies']) {
        if (JSON.stringify(installed[field]) !== JSON.stringify(candidate.manifest[field])) throw new UpdateError('manifest', '实际包声明与已验证版本清单不一致。');
      }
      if (!installed.dsh?.bundle) throw new UpdateError('bundle', '更新包不包含插件 bundle。');
      for (const patch of bundlePatchPaths(path, installed.dsh.bundle)) loadOverlayPatches('dsh', patch);
      const after = JSON.parse(await readFile(manifestPath, 'utf8'));
      const expected = structuredClone(before); expected.dependencies ??= {}; expected.dependencies[candidate.name] = after.dependencies?.[candidate.name];
      if (JSON.stringify(after) !== JSON.stringify(expected)) throw new UpdateError('profile', '包操作改变了目标插件之外的 Profile 配置。');
      await corePackages(modules, originalCore, signal);
      for (const [name, digest] of otherPackages) {
        if (await treeDigest(await realpath(join(modules, name)), signal) !== digest) throw new UpdateError('other-package', '包操作影响了其它已安装插件，已拒绝本次更新。');
      }
      await validateInstalledRuntime(profile, candidate, signal, options.subprocess);
      const state = await readState(profile.dir);
      state.installed[candidate.name] = { from: candidate.from, version: candidate.version, integrity: candidate.integrity,
        source: candidate.source, sourceSpec: candidate.sourceSpec, process: options.processId, installedAt: Date.now() };
      signal.throwIfAborted();
      await saveState(profile.dir, state);
    } catch (error) {
      // Restore links to their ORIGINAL locations; retain the snapshot until the full restoration is verified.
      try {
        await rm(modules, { recursive: true, force: true });
        if (hadModules) await copyTree(join(backup, 'node_modules'), modules, undefined, originalLinks);
        for (const [name, contents] of files) {
          if (contents === undefined) await rm(join(profile.dir, name), { force: true });
          else await writeFileAtomic(join(profile.dir, name), contents.toString('utf8'), { mode: 0o600 });
        }
        if (await treeDigest(modules) !== beforeDigest || await options.currentVersion() !== candidate.from) throw new Error('Restored tree differs');
      } catch {
        throw new UpdateError('recovery', '旧版依赖恢复核对失败。请保留此 Profile 并检查本地恢复目录，不能确认更新或回滚成功。');
      }
      if (error instanceof UpdateError && error.code === 'recovery') throw new UpdateError('recovery', '旧版依赖已恢复，但隔离校验进程尚未确认退出。已保留本地恢复目录，请检查运行状态。');
      await rm(backup, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
    // Installation is committed. A Windows file handle may defer garbage collection, not change the result.
    await rm(backup, { recursive: true, force: true }).catch(() => {});
    };
    await (options.runExclusive ? options.runExclusive(operation) : operation());
  }, { waitMs: 1000 });
}
