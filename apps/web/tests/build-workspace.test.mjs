import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

function fixture(t, graph) {
  const root = mkdtempSync(join(tmpdir(), 'easywork-build-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'node_modules'));
  symlinkSync(fileURLToPath(new URL('../node_modules/pnpm', import.meta.url)), join(root, 'node_modules/pnpm'), process.platform === 'win32' ? 'junction' : 'dir');
  copyFileSync(new URL('../scripts/build-workspace.mjs', import.meta.url), join(root, 'scripts/build-workspace.mjs'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'easywork-build-fixture', private: true, packageManager: 'pnpm@10.34.5' }));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
  writeFileSync(join(root, 'compile.cjs'), `
const fs = require('node:fs');
const pkg = JSON.parse(fs.readFileSync('package.json'));
for (const name of Object.keys(pkg.devDependencies)) {
  if (!fs.existsSync('../' + name + '/built')) throw new Error('Missing prerequisite: ' + name);
}
fs.appendFileSync('../../events.jsonl', JSON.stringify({ name: pkg.name, args: process.argv.slice(2) }) + '\\n');
if (fs.existsSync('fail')) process.exit(17);
fs.writeFileSync('built', pkg.name);
`);
  for (const [name, deps] of Object.entries(graph)) {
    const path = join(root, 'packages', name);
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'package.json'), JSON.stringify({
      name, version: '1.0.0', private: true,
      scripts: { build: 'node ../../scripts/build-workspace.mjs', 'build:local': 'node ../../compile.cjs' },
      devDependencies: Object.fromEntries(deps.map(dep => [dep, 'workspace:*'])),
    }));
  }
  return {
    root,
    run(targets, pkg) {
      return spawnSync(process.execPath, [join(root, 'scripts/build-workspace.mjs'), ...targets], {
        cwd: pkg ? join(root, 'packages', pkg) : root, encoding: 'utf8', timeout: 30_000,
      });
    },
    events() { return existsSync(join(root, 'events.jsonl')) ? readFileSync(join(root, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse) : []; },
  };
}

test('multiple roots build the shared dependency once and precede every dependent', t => {
  const f = fixture(t, { base: [], left: ['base'], right: ['base'], leaf: ['left', 'right'], unrelated: [] });
  const result = f.run(['leaf', 'left', 'right']);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const names = f.events().map(event => event.name);
  assert.equal(names.length, 4);
  assert.deepEqual(new Set(names), new Set(['base', 'left', 'right', 'leaf']));
  assert.equal(names[0], 'base');
  assert.equal(names.at(-1), 'leaf');
});

test('standalone package builds missing prerequisites without extra arguments', t => {
  const f = fixture(t, { base: [], leaf: ['base'], unrelated: [] });
  const result = f.run([], 'leaf');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(f.events(), [{ name: 'base', args: [] }, { name: 'leaf', args: [] }]);
});

test('single-package flags and argument boundaries reach only the target', t => {
  const f = fixture(t, { base: [], office: ['base'] });
  const args = ['--word-only', 'value with spaces'];
  const result = f.run(args, 'office');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(f.events(), [{ name: 'base', args: [] }, { name: 'office', args }]);
});

test('flags work when the package has no workspace dependencies', t => {
  const f = fixture(t, { base: [] });
  const result = f.run(['--example'], 'base');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.deepEqual(f.events(), [{ name: 'base', args: ['--example'] }]);
});

test('a prerequisite failure prevents the target build, including with flags', t => {
  for (const args of [[], ['--word-only']]) {
    const f = fixture(t, { base: [], office: ['base'] });
    writeFileSync(join(f.root, 'packages/base/fail'), '');
    const result = f.run(args, 'office');
    assert.notEqual(result.status, 0);
    assert.deepEqual(f.events(), [{ name: 'base', args: [] }]);
    assert.equal(existsSync(join(f.root, 'packages/office/built')), false);
  }
});

test('an unmatched build target fails instead of reporting success', t => {
  const f = fixture(t, { base: [] });
  const result = f.run(['missing']);
  assert.notEqual(result.status, 0);
  assert.deepEqual(f.events(), []);
});
