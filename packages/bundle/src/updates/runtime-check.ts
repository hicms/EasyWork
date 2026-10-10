import { createRequire } from 'node:module';
import { copyFile, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot';
import type { SubprocessRuntime } from '@deepseek-ai/dsh-subprocess';
import { personalInstallationAnchor } from './profile-anchor.js';
import { readState, stateFile } from './state.js';
import { UpdateError } from './sources.js';
import type { Candidate } from './contracts.js';
import { copyTree } from './scan.js';

/** Relocate internal pnpm links, retaining the official active-Profile resolution boundary. */
async function copyModules(source: string, target: string, signal: AbortSignal): Promise<void> {
  const links = await copyTree(source, target, signal);
  async function visit(path: string, link = false): Promise<void> {
    signal.throwIfAborted();
    if (link) {
      const original = join(source, relative(target, path));
      const destination = resolve(dirname(original), await readlink(path));
      const inside = relative(source, destination);
      if (!inside.startsWith('..') && !isAbsolute(inside)) {
        await rm(path, { force: true });
        const type = links.get(relative(target, path))!;
        await symlink(join(target, inside), path, process.platform === 'win32' && type === 'dir' ? 'junction' : type);
      }
    } else for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.isDirectory()) await visit(join(path, entry.name), entry.isSymbolicLink());
    }
  }
  await visit(target);
}

/** Exercise the official boot and bundle entries in a disposable Home before committing. */
export async function validateInstalledRuntime(profile: ProfileContext, candidate: Candidate, signal: AbortSignal, subprocess: SubprocessRuntime): Promise<void> {
  const temporary = await mkdtemp(join(tmpdir(), 'easywork-plugin-validation-'));
  const scratch = join(temporary, 'profiles', 'validation');
  let quiescent = true;
  try {
    await mkdir(scratch, { recursive: true });
    for (const name of ['package.json', 'cordis.patch.yml', 'pnpm-workspace.yaml', 'compatibility.json']) {
      try { await copyFile(join(profile.dir, name), join(scratch, name)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    await copyModules(join(profile.dir, 'node_modules'), join(scratch, 'node_modules'), signal);
    const state = await readState(profile.dir);
    state.installed[candidate.name] = { from: candidate.from, version: candidate.version, integrity: candidate.integrity, source: candidate.source, process: 'validation', installedAt: Date.now() };
    await writeFile(join(scratch, stateFile), JSON.stringify(state));
    const localAnchor = relative(profile.dir, profile.installAnchor);
    // A self-contained Web Profile boots its cloned core; Desktop uses its immutable external installation.
    const sourceAnchor = !localAnchor.startsWith('..') && !isAbsolute(localAnchor) ? join(scratch, localAnchor) : profile.installAnchor;
    const anchor = await personalInstallationAnchor(sourceAnchor, scratch, temporary);
    const require = createRequire(sourceAnchor);
    const boot = join(dirname(require.resolve('@deepseek-ai/dsh/package.json')), 'lib', 'profile-boot.js');
    const appBoot = require.resolve('@deepseek-ai/dsh-app-boot');
    const inventory = require.resolve('@deepseek-ai/dsh-host-plugin-inventory');
    const overlay = join(temporary, 'overlays.json');
    // Parsed official overlays retain inert !!js nodes and installation-owned providers.
    await writeFile(overlay, JSON.stringify([...profile.overlays, { id: 'webserver', config: { host: '127.0.0.1', port: 0 } }]), { mode: 0o600 });
    const script = join(temporary, 'validate.mjs');
    const resultFile = join(temporary, 'result');
    await writeFile(script, `
import { runProfile } from ${JSON.stringify(pathToFileURL(boot).href)};
import { loadProfileDirectory, loadLayeredEnv, bundlePatchPaths, loadOverlayPatches, composeEntries } from ${JSON.stringify(pathToFileURL(appBoot).href)};
import { readPluginInventory } from ${JSON.stringify(pathToFileURL(inventory).href)};
import { readFile, writeFile } from 'node:fs/promises';
const profile = loadProfileDirectory('dsh', ${JSON.stringify(scratch)}, ${JSON.stringify(anchor)});
let running;
try {
  if (profile.skippedBundles.some(b => b.packageName === ${JSON.stringify(candidate.name)})) throw Error('target skipped');
  running = await runProfile({ environment: loadLayeredEnv('dsh'), profile: 'validation', resolvedProfile: { profile, installAnchor: ${JSON.stringify(anchor)} }, patchFiles: [${JSON.stringify(overlay)}], args: ['--no-open', '--host', '127.0.0.1', '--port', '0'] });
  const { entries } = await readPluginInventory(running.ctx);
  const targetDir = ${JSON.stringify(join(scratch, 'node_modules', candidate.name))};
  const manifest = JSON.parse(await readFile(targetDir + '/package.json', 'utf8'));
  const patches = bundlePatchPaths(targetDir, manifest.dsh.bundle).flatMap(file => loadOverlayPatches('dsh', file));
  const flatten = rows => rows.flatMap(row => row.group && Array.isArray(row.config) ? flatten(row.config) : [row]);
  const declared = flatten(composeEntries([patches.filter(p => p.insert !== undefined)])).filter(r => typeof r.id === 'string' && typeof r.name === 'string');
  if (!declared.length) throw Error('bundle has no verifiable runtime entries');
  const selected = JSON.parse(await readFile(${JSON.stringify(join(scratch, 'package.json'))}, 'utf8')).dsh?.profile?.bundles?.includes(${JSON.stringify(candidate.name)});
  const live = new Map([...running.ctx.loader.entries()].map(entry => [entry.options.id, entry]));
  for (const row of declared) {
    const loaded = live.get(row.id);
    await (loaded?.parent.tree ?? running.ctx.loader).import(row.name);
    if (selected) {
      const entry = entries.find(p => p.entryId === loaded?.id);
      if (!entry || entry.enabled && entry.fiberPhase !== 'active') throw Error('target entry missing or inactive');
    }
  }
  await running.shutdown.shutdown(0);
  await writeFile(${JSON.stringify(resultFile)}, 'ok');
} catch { if (running) await running.shutdown.shutdown(1); process.exitCode = 1; }
`);
    signal.throwIfAborted();
    const child = subprocess.spawn({ argv: [process.execPath, script], cwd: temporary,
      stdio: { stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } }, graceMs: 1000,
      signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
      env: { DSH_HOME: temporary, DSH_AGENTS_HOME: join(temporary, 'agents'), DSH_TELEMETRY_DISABLED: '1', DSH_BUNDLED_PRIMARY_RUNTIME: process.env.DSH_BUNDLED_PRIMARY_RUNTIME },
    });
    let code: number | null = null;
    try { code = (await child.done).exitCode; }
    finally {
      child.terminate();
      quiescent = await child.waitForExit(AbortSignal.timeout(15000)).catch(() => false);
      if (!quiescent) throw new UpdateError('recovery', '隔离校验进程尚未确认退出，无法确认更新完成。请保留恢复目录。');
    }
    let result = '';
    try { result = await readFile(resultFile, 'utf8'); } catch {}
    if (code !== 0 || result !== 'ok' || signal.aborted) throw new UpdateError('runtime', '新版未通过隔离启动校验，旧版本已恢复。');
  } finally { if (quiescent) await rm(temporary, { recursive: true, force: true }).catch(() => {}); }
}
