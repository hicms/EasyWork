import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ownedPlugins } from './contracts.js';
import { withFileLock } from '@deepseek-ai/dsh-atomic-write';
import { createRuntimeResolution } from '@deepseek-ai/dsh-app-boot';

/** A resolution projection, not a second runtime. Only verified personal feature updates override the installation. */
export async function personalInstallationAnchor(sourceAnchor: string, profile: string, home: string): Promise<string> {
  const statePath = join(profile, '.easywork-plugin-updates.json');
  if (!existsSync(statePath)) return sourceAnchor;
  return withFileLock(join(profile, 'package.json'), async () => {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const overrides: Record<string, string> = {};
  for (const name of ownedPlugins) {
    const record = state.installed?.[name];
    if (!record || record.source !== 'center') continue;
    const path = join(profile, 'node_modules', name);
    const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
    if (manifest.name !== name || manifest.version !== record.version) throw new Error('EasyWork personal plugin update is incomplete: ' + name);
    overrides[name] = realpathSync(path);
  }
  if (!Object.keys(overrides).length) return sourceAnchor;
  const source = JSON.parse(readFileSync(sourceAnchor, 'utf8'));
  const original = await createRuntimeResolution({ installAnchor: sourceAnchor, home });
  // CLI Web profiles already resolve their own packages locally; only installation-owned names need projection.
  if (!original.entries.some(entry => Object.hasOwn(overrides, entry.name))) return sourceAnchor;
  const digest = createHash('sha256').update('projection-v2').update(sourceAnchor).update(JSON.stringify(source)).update(JSON.stringify(overrides)).digest('hex');
  const root = join(home, '.easywork-installations', digest);
  const anchor = join(root, 'package.json');
  const verified = join(root, 'verified');
  if (existsSync(anchor) && existsSync(verified)) return anchor;
  const entries = original.entries.filter(entry => entry.name !== source.name);
  const projected = { ...source, dependencies: source.dependencies ?? {}, peerDependencies: Object.fromEntries(entries.filter(entry => !Object.hasOwn(source.dependencies ?? {}, entry.name)).map(entry => [entry.name, entry.version ?? '*'])), optionalDependencies: {} };
  for (const entry of entries) {
    const name = entry.name;
    const target = overrides[name] ?? entry.packageDir;
    if (!target) throw new Error('Missing installation dependency: ' + name);
    const link = join(root, 'node_modules', name);
    mkdirSync(dirname(link), { recursive: true });
    if (!existsSync(link)) symlinkSync(realpathSync(target), link, process.platform === 'win32' ? 'junction' : 'dir');
  }
  // Every direct dependency is linked before the official resolver traverses its closure.
  // Updated names therefore win once, while all official names retain their original real paths.
  writeFileSync(anchor, JSON.stringify(projected), { mode: 0o600 });
  const resolved = await createRuntimeResolution({ installAnchor: anchor, home });
  for (const before of entries) {
    const after = resolved.entries.find(entry => entry.name === before.name);
    if (!after || realpathSync(after.packageDir) !== realpathSync(overrides[before.name] ?? before.packageDir)) throw new Error('Unexpected runtime dependency change: ' + before.name);
  }
  writeFileSync(verified, digest, { mode: 0o600 });
  return anchor;
  }, { waitMs: 120000 });
}
