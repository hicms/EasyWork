import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { officialWebClients, root } from './official-web-clients.mjs';

const canonical = await officialWebClients();
const path = join(root, '../../profiles/shared/official-web-clients.json');
const current = JSON.parse(await readFile(path, 'utf8'));
const officialClients = canonical.clients.map(({ id, package: name, version, source, row, declaration, conditional, hostAdmission, hostBehavior }) => ({
  id, package: name, version, source, row, client: declaration, conditional,
  ...(hostAdmission ? { hostAdmission } : {}), ...(hostBehavior ? { hostBehavior } : {}),
}));
const expected = { ...current, dshVersion: canonical.version, sources: canonical.sources, officialClients };
if (process.argv.includes('--write')) await writeFile(path, JSON.stringify(expected, null, 2) + '\n');
else {
  assert.deepEqual(current.dshVersion, expected.dshVersion, 'Official Web runtime version drift');
  assert.deepEqual(current.sources, expected.sources, 'Official base/Web source fingerprint drift');
  assert.deepEqual(current.officialClients, expected.officialClients, 'Official complete Web roster drift; regenerate from the locked published packages');
}
console.log(JSON.stringify({ dshVersion: canonical.version, officialClients: officialClients.length, completePublishedRoster: true }));
