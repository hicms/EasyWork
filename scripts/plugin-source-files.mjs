import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const lockPath = 'profiles/shared/plugin-sources.lock.json';
export const scriptsPath = 'profiles/shared/plugin-build-scripts.json';
export const repository = 'https://github.com/hicms/easywork-plugins.git';
export function canonical(bytes) {
  if (bytes.includes(0)) return bytes;
  try { return Buffer.from(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replaceAll('\r\n', '\n')); }
  catch { return bytes; }
}
export const digest = bytes => createHash('sha256').update(canonical(bytes)).digest('hex');
export const readJson = async (root, path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
export const pluginPrefix = name => `packages/plugins/${name}/`;
export function validPath(path, names) {
  return typeof path === 'string' && !path.includes('\\') && !path.includes('\0') && !path.includes(':')
    && path.split('/').every(part => part && part !== '.' && part !== '..')
    && names.some(name => path.startsWith(pluginPrefix(name)));
}
export async function inventory(root, names) {
  const files = [];
  async function visit(relative) {
    const stat = await lstat(resolve(root, relative));
    if (stat.isSymbolicLink()) throw new Error(`Plugin source must not be a link: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of await readdir(resolve(root, relative))) {
        if (['node_modules', 'dist', '__pycache__'].includes(name) || name.endsWith('.tsbuildinfo')) continue;
        await visit(`${relative}/${name}`);
      }
    } else if (stat.isFile()) files.push(relative);
    else throw new Error(`Unsupported source file: ${relative}`);
  }
  for (const name of names) {
    if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error('Invalid plugin directory');
    await visit(`packages/plugins/${name}`);
  }
  return files.sort();
}
export async function verify(root) {
  const lock = await readJson(root, lockPath);
  const overrides = await readJson(root, scriptsPath);
  const names = Object.keys(overrides).sort();
  if (lock.schemaVersion !== 1 || lock.repository !== repository || !/^[0-9a-f]{40}$/.test(lock.revision)
    || JSON.stringify(lock.plugins) !== JSON.stringify(names)) throw new Error('Invalid plugin source lock');
  const expected = Object.keys(lock.files).sort();
  if (!expected.length || expected.some(file => !validPath(file, names))) throw new Error('Invalid locked plugin path');
  const actual = await inventory(root, names);
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Plugin source inventory changed (missing or extra files); sync from easywork-plugins');
  for (const file of expected) {
    if (digest(await readFile(resolve(root, file))) !== lock.files[file].sha256) {
      throw new Error(`Generated plugin source changed: ${file}; edit easywork-plugins and sync its commit`);
    }
  }
  for (const name of names) {
    const manifest = await readJson(root, `${pluginPrefix(name)}package.json`);
    if (JSON.stringify(manifest.scripts) !== JSON.stringify(overrides[name])) throw new Error(`App build scripts differ from their projection: ${name}`);
  }
  return lock;
}
export async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const staged = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(staged, bytes, { flag: 'wx' }); await rename(staged, path); }
  finally { await unlink(staged).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
