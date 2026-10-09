import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, lstat, realpath, readFile, copyFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

// Explicit inputs: this script never selects or boots a user's Profile implicitly.
const [homeArg, agentsArg, profileArg, outputArg] = process.argv.slice(2);
if (![homeArg, agentsArg, profileArg, outputArg].every(Boolean)) {
  throw new Error('Usage: node probe-browser-personal-baseline.mjs HOME AGENTS PROFILE OUTPUT_PARENT');
}
const home = resolve(homeArg), agents = resolve(agentsArg), profile = resolve(profileArg);
const parent = resolve(outputArg);
for (const source of [home, agents]) {
  assert.equal(await realpath(source), source, 'Source root must not traverse a symbolic link');
  assert.ok(parent !== source && !parent.startsWith(source + '/'), 'Output must be outside source trees');
}
await mkdir(parent, { recursive: true, mode: 0o700 });
assert.equal(await realpath(parent), parent, 'Output root must not traverse a symbolic link');
const output = await mkdtemp(join(parent, 'browser-'));
const selection = {
  home: ['storages/workdsh_identity_local.json', 'storages/workdsh_experts',
    'storages/workdsh_library', 'storages/workdsh_connectors',
    'storages/workdsh_connector_selections', 'storages/workdsh_runtime_binding',
    'storages/workdsh_projects', 'storages/workspace.json',
    'sessions', 'library', 'skills', 'attachments', '.agent-presets'],
  agents: ['skills', '.workdsh-state', '.workdsh-catalog', '.workdsh-disabled', '.workdsh-trash', '.skill-lock.json'],
};
const records = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function capture(root, group, relative) {
  const source = join(root, relative);
  let stat;
  try { stat = await lstat(source); } catch (error) { if (error.code === 'ENOENT') return; throw error; }
  assert.ok(!stat.isSymbolicLink(), 'Symbolic links require a separately reviewed snapshot');
  assert.equal(await realpath(source), source, 'Source parents must not traverse symbolic links');
  const target = join(output, 'snapshot', group, relative);
  if (stat.isDirectory()) {
    await mkdir(target, { recursive: true, mode: 0o700 });
    for (const name of (await readdir(source)).sort()) await capture(root, group, join(relative, name));
  } else {
    assert.ok(stat.isFile(), 'Only regular files are captured');
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const before = hash(await readFile(source));
    await copyFile(source, target);
    const copied = hash(await readFile(target));
    assert.equal(copied, before, 'Source changed while copying');
    records.push({ group, relative, sha256: copied, bytes: stat.size });
  }
}
for (const [group, names] of Object.entries(selection)) {
  for (const name of names) await capture(group === 'home' ? home : agents, group, name);
}
await writeFile(join(output, 'manifest.json'), JSON.stringify({ selection, records }, null, 2), { mode: 0o600 });

const require = createRequire(join(profile, 'package.json'));
const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')));
const { default: JsonlPersistence } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-session-persistence-jsonl')));
const ctx = new Context();
let sessions = 0, events = 0;
const unreadable = [];
try {
  await ctx.plugin(JsonlPersistence, { root: join(output, 'snapshot', 'home', 'sessions') });
  for (const item of await ctx.sessionPersistence.list()) {
    let reader;
    try {
      reader = await ctx.sessionPersistence.open(item.header.id, 'read');
      events += (await reader.read()).events.length; sessions++;
    } catch (error) {
      // Report identity fingerprints and error classes only, never conversation contents.
      unreadable.push({ sessionFingerprint: hash(String(item.header.id)), error: error.name });
    } finally { await reader?.close(); }
  }
} finally { await ctx.fiber.dispose(); }
// Verify both snapshot and live source: no test writes and no unnoticed active changes.
for (const record of records) {
  assert.equal(hash(await readFile(join(output, 'snapshot', record.group, record.relative))), record.sha256);
  assert.equal(hash(await readFile(join(record.group === 'home' ? home : agents, record.relative))), record.sha256,
    'Live source changed during baseline; repeat when stable');
}
const report = { files: records.length, bytes: records.reduce((n, r) => n + r.bytes, 0),
  sessions, events, unreadable, snapshotVerified: true, originalsUnchanged: true,
  limitations: ['No project workspaces, runtime secrets or caches', 'No real model or external MCP calls', 'No full Profile boot'] };
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ output, ...report, unreadable: unreadable.length }));
if (unreadable.length) process.exitCode = 1;
