/** The owned Profile patch is the authority for the account/model takeover. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../packages/plugins/skills/package.json', import.meta.url));
const yaml = require('yaml');
const operations = yaml.parse(readFileSync(new URL('../packages/plugins/models/cordis.patch.yml', import.meta.url), 'utf8'));
export const replacedOfficialIds = Object.freeze(operations.filter(operation => operation.disabled === true).map(operation => operation.id));
export function isReplacedOfficialClient(client) { return replacedOfficialIds.includes(client.id); }
export function verifyEasyWorkClientGraph(clients, ids) {
  if (!ids.has('easywork-plugin-models')) throw new Error('Missing shared EasyWork account/model client');
  for (const client of clients) {
    if (isReplacedOfficialClient(client)) {
      if (ids.has(client.package)) throw new Error('Replaced official account/model client is still active: ' + client.package);
    } else if (!client.conditional && !ids.has(client.package)) {
      throw new Error('Unconditional official Web client missing at runtime: ' + client.package);
    }
  }
}
