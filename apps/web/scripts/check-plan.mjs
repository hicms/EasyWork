import { validateAcceptance } from './validate-acceptance.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const essentialDocuments = [
  'AGENTS.md', 'README.md', 'README.zh-CN.md',
  'docs/REQUIREMENTS.md', 'docs/ENTERPRISE-REQUIREMENTS.md',
  'docs/ARCHITECTURE.md', 'docs/CONTRACTS.md', 'docs/ACCEPTANCE.md',
  'docs/requirements.json', 'docs/modules.json', 'docs/acceptance.json',
  'docs/FEATURE-DEVELOPMENT-CONTRACT.md', 'docs/HARNESS-OFFICIAL-DEVELOPMENT.md',
  'docs/PLUGIN-DELIVERY.md', 'docs/EXTERNAL-PLUGINS.md',
];

/** Static source/contract integrity; does not infer product acceptance from build output. */
export function validatePlan(base = root) {
  const failures = [];
  const boundary = existsSync(resolve(base, "../../upstream.json")) ? resolve(base, "../..") : base;
  const read = name => readFileSync(resolve(base, name), 'utf8');
  const requirePath = name => {
    if (typeof name !== 'string' || isAbsolute(name) || relative(boundary, resolve(base, name)).startsWith('..')) {
      failures.push(`Invalid repository path: ${name}`); return false;
    }
    if (!existsSync(resolve(base, name))) { failures.push(`Missing: ${name}`); return false; }
    return true;
  };
  essentialDocuments.forEach(requirePath);
  if (failures.length) return { failures, modules: [], documents: essentialDocuments };
  const markdownFiles = directory => readdirSync(resolve(base, directory), { withFileTypes: true })
    .flatMap(entry => {
      const path = `${directory}/${entry.name}`;
      return entry.isDirectory() ? markdownFiles(path) : (entry.name.endsWith('.md') ? [path] : []);
    });
  const documents = [...new Set([...essentialDocuments, ...markdownFiles('docs')])];
  failures.push(...validateAcceptance(base).failures);
  const officialStandard = read('docs/HARNESS-OFFICIAL-DEVELOPMENT.md');
  for (const rule of ['sidebar.panellist', 'rightbar.session', 'ctx.slots.inject', 'peerDependencies', 'ctx.effect']) {
    if (!officialStandard.includes(rule)) failures.push(`Harness standard missing rule: ${rule}`);
  }
  let modules, requirements;
  try {
    modules = JSON.parse(read('docs/modules.json'));
    requirements = JSON.parse(read('docs/requirements.json'));
  } catch (error) {
    return { failures: [...failures, `Invalid contract JSON: ${error.message}`], modules: [], documents };
  }
  if (!Array.isArray(modules)) return { failures: [...failures, 'Invalid module registry'], modules: [], documents };
  if (requirements?.schemaVersion !== 1 || !Array.isArray(requirements.requirements)) {
    return { failures: [...failures, 'Invalid requirement schema'], modules, documents };
  }
  const requirementIds = new Set();
  const describedRequirements = new Set([...read('docs/REQUIREMENTS.md').matchAll(/^\| (R\d+) \|/gm)].map(match => match[1]));
  const entryPoints = new Set(['personal-web', 'personal-desktop', 'enterprise-web', 'enterprise-desktop']);
  const deliveries = new Set(['default', 'optional', 'external', 'infrastructure', 'mode-specific', 'planned']);
  for (const item of requirements.requirements) {
    if (!item || typeof item !== 'object') { failures.push('Invalid requirement'); continue; }
    if (!/^R\d+$/.test(item.id)) failures.push(`Invalid requirement id: ${item.id}`);
    if (requirementIds.has(item.id)) failures.push(`Duplicate requirement: ${item.id}`);
    requirementIds.add(item.id);
    if (!describedRequirements.has(item.id)) failures.push(`Missing requirement description: ${item.id}`);
    for (const field of ['title', 'sourceOwner', 'dataBoundary', 'contract']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) failures.push(`Missing requirement ${field}: ${item.id}`);
    }
    requirePath(item.sourceOwner);
    if (!deliveries.has(item.delivery)) failures.push(`Invalid requirement delivery: ${item.id}`);
    if (!Array.isArray(item.entryPoints) || !item.entryPoints.length || item.entryPoints.some(point => !entryPoints.has(point))) {
      failures.push(`Invalid supported entry points: ${item.id}`);
    }
    for (const field of ['checks', 'acceptance']) {
      if (!Array.isArray(item[field]) || (field === 'acceptance' && !item[field].length)) failures.push(`Missing requirement ${field}: ${item.id}`);
      else if (new Set(item[field]).size !== item[field].length) failures.push(`Duplicate requirement ${field}: ${item.id}`);
    }
    for (const check of Array.isArray(item.checks) ? item.checks : []) requirePath(check);
  }
  for (const id of describedRequirements) if (!requirementIds.has(id)) failures.push(`Unmapped requirement: ${id}`);

  const seen = new Set();
  for (const entry of modules) {
    if (!entry || typeof entry !== 'object') { failures.push('Invalid module'); continue; }
    if (seen.has(entry.path)) failures.push(`Duplicate module: ${entry.path}`);
    seen.add(entry.path);
    if (!/^(?:(?:\.\.\/\.\.\/)?packages\/(?:(?:plugins|providers)\/)?|examples\/)[a-z][a-z0-9-]*$/.test(entry.path)) {
      failures.push(`Invalid module path: ${entry.path}`); continue;
    }
    if (!['planned', 'in_progress', 'implemented'].includes(entry.status)) failures.push(`Invalid status: ${entry.path}`);
    if (!Array.isArray(entry.requirements) || !entry.requirements.length) failures.push(`Missing module requirements: ${entry.path}`);
    else for (const id of entry.requirements) if (!requirementIds.has(id)) failures.push(`Unknown module requirement: ${entry.path}: ${id}`);
    requirePath(`${entry.path}/README.md`);
    if (!Array.isArray(entry.directories)) failures.push(`Invalid module directories: ${entry.path}`);
    else for (const sub of entry.directories) requirePath(`${entry.path}/${sub}`);
    const manifestPath = `${entry.path}/package.json`;
    if (entry.moduleVersion !== undefined && !/^\d+\.\d+$/.test(entry.moduleVersion)) failures.push(`Invalid module version: ${entry.path}`);
    if (existsSync(resolve(base, manifestPath))) {
      const manifest = JSON.parse(read(manifestPath));
      const packageLine = String(manifest.version ?? '').split('.').slice(0, 2).join('.');
      if (entry.moduleVersion && packageLine !== entry.moduleVersion) failures.push(`Module/package version mismatch: ${entry.path}`);
      if (entry.status === 'planned' && (manifest.dsh || manifest.exports || manifest.main || manifest.bin)) {
        failures.push(`Planned module declares executable entry: ${entry.path}`);
      }
    }
  }
  for (const category of ['plugins', 'providers']) {
    requirePath(`../../packages/${category}/README.md`);
    if (existsSync(resolve(base, `../../packages/${category}/package.json`))) failures.push(`${category} category must not be a workspace package`);
  }
  for (const directory of ['../../packages', '../../packages/plugins', '../../packages/providers', 'examples']) {
    if (!requirePath(directory)) continue;
    for (const item of readdirSync(resolve(base, directory), { withFileTypes: true })) {
      if (directory === '../../packages' && ['plugins', 'providers'].includes(item.name)) continue;
      if (!item.isDirectory() || seen.has(`${directory}/${item.name}`)) continue;
      const localPrototype = directory === 'examples' && spawnSync('git',
        ['check-ignore', '-q', '--', `${directory}/${item.name}`], { cwd: base }).status === 0;
      if (!localPrototype) failures.push(`Unregistered module: ${directory}/${item.name}`);
    }
  }
  for (const name of [...documents, '../../packages/plugins/README.md', '../../packages/providers/README.md', ...modules.filter(item => item?.path).map(item => `${item.path}/README.md`)]) {
    if (!existsSync(resolve(base, name)) || !name.endsWith('.md')) continue;
    for (const match of read(name).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      const destination = resolve(base, dirname(name), decodeURIComponent(target));
      if (!existsSync(destination)) failures.push(`Broken link in ${name}: ${relative(base, destination)}`);
    }
  }
  return { failures, modules, documents, requirements: requirements.requirements };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = validatePlan();
  if (result.failures.length) {
    process.stderr.write(result.failures.join('\n') + '\n'); process.exitCode = 1;
  } else {
    process.stdout.write(`PASS: ${result.modules.length} modules; ${result.requirements.length} requirements; ${result.documents.length} documents; source ownership, delivery, acceptance mappings and relative links checked.\n`);
    process.stdout.write('Static contract integrity only; product, model, GUI and packaged-runtime acceptance are separate gates.\n');
  }
}
