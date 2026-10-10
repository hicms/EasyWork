import { execFileSync } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { atomicWrite, canonical, digest, inventory, lockPath, pluginPrefix, readJson, repository, scriptsPath, validPath, verify } from './plugin-source-files.mjs';

const root = resolve(import.meta.dirname, '..');
const [sourceArgument, revision] = process.argv.slice(2);
if (!sourceArgument || !/^[0-9a-f]{40}$/.test(revision ?? '')) throw new Error('Usage: node scripts/sync-plugin-sources.mjs <clean-plugin-repository> <full-commit-sha>');
const source = resolve(sourceArgument);
const git = (cwd, args, encoding = 'utf8') => execFileSync('git', args, { cwd, encoding, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
if (git(source, ['rev-parse', 'HEAD']).trim() !== revision) throw new Error('Source checkout must be at the requested commit');
if (git(source, ['status', '--porcelain']).trim()) throw new Error('Commit plugin source changes before syncing');
if (git(source, ['remote', 'get-url', 'origin']).trim().replace(/\.git$/, '') !== repository.replace(/\.git$/, '')) throw new Error('Unexpected plugin origin');
const overrides = await readJson(root, scriptsPath);
const names = Object.keys(overrides).sort();
const existing = await inventory(root, names);
const dirty = git(root, ['status', '--porcelain', '--', ...names.map(name => pluginPrefix(name))]);
if (dirty.trim()) throw new Error('Consumer plugin directories have uncommitted changes; preserve or commit them before sync');
let oldLock;
try { oldLock = await readFile(resolve(root, lockPath)); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (oldLock) await verify(root);

const updates = new Map();
const files = {};
for (const name of names) {
  const prefix = `plugins/${name}/`;
  const entries = git(source, ['ls-tree', '-r', '-z', revision, '--', prefix]).split('\0').filter(Boolean);
  if (!entries.length) throw new Error(`Plugin is missing in source: ${name}`);
  for (const entry of entries) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    if (!match || !match[3].startsWith(prefix)) throw new Error('Only regular Git source files can be synced');
    const path = pluginPrefix(name) + match[3].slice(prefix.length);
    if (!validPath(path, names) || /(?:^|\/)(?:node_modules|dist|__pycache__)(?:\/|$)/.test(path)) throw new Error('Invalid source path');
    let bytes = canonical(git(source, ['cat-file', 'blob', match[2]], 'buffer'));
    if (path === `${pluginPrefix(name)}package.json`) {
      const manifest = JSON.parse(bytes);
      if (manifest.name !== `easywork-plugin-${name}`) throw new Error('Source package name differs');
      manifest.scripts = overrides[name];
      bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    }
    files[path] = { source: match[3], sha256: digest(bytes) };
    updates.set(path, bytes);
  }
}
// Prepare the entire change before touching the consumer, and restore handled write failures.
const changes = [];
for (const path of new Set([...existing, ...updates.keys(), lockPath])) {
  let before;
  try { before = await readFile(resolve(root, path)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const after = path === lockPath ? Buffer.from(JSON.stringify({ schemaVersion: 1, repository, revision, plugins: names, files }, null, 2) + '\n') : updates.get(path);
  if (before && after && canonical(before).equals(after)) continue;
  changes.push({ path, before, after });
}
const applied = [];
try {
  for (const change of changes) {
    if (change.after) await atomicWrite(resolve(root, change.path), change.after);
    else await unlink(resolve(root, change.path));
    applied.push(change);
  }
  await verify(root);
} catch (error) {
  for (const change of applied.reverse()) {
    if (change.before) await atomicWrite(resolve(root, change.path), change.before);
    else await unlink(resolve(root, change.path));
  }
  throw error;
}
console.log(`Synced ${names.length} plugins at ${revision}; ${changes.length} files changed`);
