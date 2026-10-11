import assert from 'node:assert/strict';
import test from 'node:test';
import { connectorProcess } from '../../../packages/plugins/connectors/dist/manager.js';

test('bundled MCP example follows relocated Node and Electron installations', () => {
  for (const command of ['C:\\old\\node.exe', 'C:\\old\\EasyWork.exe', '/old/EasyWork', '/old/electron']) {
    const definition = { id: 'easywork-example', serverName: 'easywork-example', transport: 'stdio',
      command, args: ['/old/example-server.mjs'] };
    const actual = connectorProcess(definition);
    assert.equal(actual.command, process.execPath);
    assert.notEqual(actual.args[0], definition.args[0]);
    assert.match(actual.args[0], /example-server\.mjs$/u);
    assert.deepEqual(connectorProcess({ ...definition, id: 'personal-server' }), { command, args: definition.args });
    assert.deepEqual(connectorProcess({ ...definition, command: '/custom/server' }), { command: '/custom/server', args: definition.args });
  }
});
