import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve, relative, sep } from 'node:path';

/** Validate finite scenarios against product requirements, without a development ledger. */
export function validateAcceptance(root) {
  const failures = [];
  let data, doc, requirements;
  try {
    data = JSON.parse(readFileSync(resolve(root, 'docs/acceptance.json'), 'utf8'));
    doc = readFileSync(resolve(root, 'docs/ACCEPTANCE.md'), 'utf8');
    requirements = JSON.parse(readFileSync(resolve(root, 'docs/requirements.json'), 'utf8'));
  } catch (error) {
    return { failures: [`Cannot read acceptance contract: ${error.message}`], cases: [] };
  }
  if (data?.schemaVersion !== 1 || !Array.isArray(data.cases)) {
    return { failures: ['Invalid acceptance schema'], cases: [] };
  }
  if (requirements?.schemaVersion !== 1 || !Array.isArray(requirements.requirements)) {
    return { failures: ['Invalid requirement schema'], cases: data.cases };
  }
  const knownRequirements = new Map(requirements.requirements.filter(item => item && typeof item === 'object').map(item => [item.id, item]));
  const described = new Set([...doc.matchAll(/^\| ([A-Z]+\d+(?:-P\d)?) \||^- ([A-Z]+\d+(?:-P\d)?)：/gm)].map(match => match[1] || match[2]));
  const seen = new Set();
  for (const item of data.cases) {
    if (!item || typeof item !== 'object') { failures.push('Invalid acceptance case'); continue; }
    if (!/^[A-Z]+\d+(?:-P\d)?$/.test(item.id)) failures.push(`Invalid acceptance id: ${item.id}`);
    if (seen.has(item.id)) failures.push(`Duplicate acceptance: ${item.id}`);
    seen.add(item.id);
    if (!described.has(item.id)) failures.push(`Missing scenario description: ${item.id}`);
    if (!['基础', 'P0', 'P1', 'P2', 'P3'].includes(item.phase)) failures.push(`Invalid single phase: ${item.id}`);
    if (!['pending', 'passed', 'failed', 'blocked'].includes(item.status)) failures.push(`Invalid acceptance status: ${item.id}`);
    if (!Array.isArray(item.requirements) || !item.requirements.length) failures.push(`Missing acceptance requirements: ${item.id}`);
    else {
      if (new Set(item.requirements).size !== item.requirements.length) failures.push(`Duplicate acceptance requirement: ${item.id}`);
      for (const id of item.requirements) {
        const requirement = knownRequirements.get(id);
        if (!requirement) failures.push(`Unknown requirement: ${item.id}: ${id}`);
        else if (!requirement.acceptance?.includes(item.id)) failures.push(`Missing reverse acceptance mapping: ${item.id}: ${id}`);
      }
    }
    if (!Array.isArray(item.evidence)) { failures.push(`Invalid evidence: ${item.id}`); continue; }
    if (item.status === 'passed' && !item.evidence.length) failures.push(`Passed without evidence: ${item.id}`);
    for (const path of item.evidence) {
      if (typeof path !== 'string') { failures.push(`Invalid evidence path: ${item.id}`); continue; }
      const target = resolve(root, path);
      const location = relative(root, target).split(sep).join('/');
      // Acceptance output belongs to the ignored local/CI artifacts, never docs diaries.
      if (isAbsolute(path) || !location.startsWith('.artifacts/') || !existsSync(target)) {
        failures.push(`Invalid evidence path: ${item.id}`);
      }
    }
  }
  for (const id of described) if (!seen.has(id)) failures.push(`Unmapped acceptance: ${id}`);
  for (const requirement of knownRequirements.values()) {
    for (const id of requirement.acceptance ?? []) {
      const item = data.cases.find(item => item?.id === id);
      if (!item?.requirements?.includes(requirement.id)) failures.push(`Invalid requirement acceptance mapping: ${requirement.id}: ${id}`);
    }
  }
  return { failures, cases: data.cases };
}
