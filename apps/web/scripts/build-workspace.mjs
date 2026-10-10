import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const wholeWorkspace = resolve(process.cwd()) === root;
const targets = wholeWorkspace ? args : [JSON.parse(readFileSync('package.json', 'utf8')).name];
const forwarded = wholeWorkspace ? [] : args;
if (!targets.length) throw new Error('Select at least one workspace package to build');

function run(selectors, scriptArgs = [], allowEmpty = false) {
  const result = spawnSync(process.execPath, [
    join(root, 'node_modules/pnpm/bin/pnpm.cjs'),
    '--recursive', '--sort', '--workspace-concurrency=1',
    ...allowEmpty ? [] : ['--fail-if-no-match'],
    ...selectors.flatMap(selector => ['--filter', selector]),
    'run', 'build:local', ...scriptArgs,
  ], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Single-package flags such as Office's --word-only belong only to that package.
if (forwarded.length) {
  run(targets.map(name => `${name}^...`), [], true);
  run(targets, forwarded);
} else {
  run(targets.map(name => `${name}...`));
}
