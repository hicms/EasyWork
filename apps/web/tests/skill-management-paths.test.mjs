import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const require = createRequire(new URL('../../../packages/plugins/skills/package.json', import.meta.url));

test('Windows skill paths respect volume and catalog boundaries', async t => {
  const entries = [
    { name: 'inside', payload: 'payloads/inside', icon: 'icons/inside.svg' },
    { name: 'cross-volume', payload: 'D:\\External\\skill', icon: 'D:\\External\\icon.svg' },
    { name: 'parent', payload: '../outside', icon: '../outside.svg' },
    { name: 'root', payload: '.' },
  ];
  t.mock.module('node:path', { namedExports: { ...path.win32 }, defaultExport: path.win32 });
  t.mock.module('node:fs/promises', { namedExports: { ...fs,
    mkdir: async () => {}, readdir: async () => [], realpath: async value => value,
    lstat: async value => ({ isSymbolicLink: () => false, isFile: () => Boolean(path.win32.extname(value)), isDirectory: () => !path.win32.extname(value) }),
    stat: async () => ({ mtimeMs: 1, size: 1 }),
    readFile: async value => value.endsWith('catalog.json')
      ? JSON.stringify({ schema: 1, kind: 'easywork-skill-catalog', entries })
      : value.endsWith('.svg') ? Buffer.from('<svg/>')
        : '---\nname: personal-skill\ndescription: User skill\n---\nPersonal instructions\n',
  } });
  const { Context } = await import(pathToFileURL(require.resolve('@deepseek-ai/cordis')).href);
  const { SkillManager } = await import('../../../packages/plugins/skills/dist/services/manager.js');
  const { SkillCatalogStore } = await import('../../../packages/plugins/skills/dist/services/catalog.js');
  await t.test('bundled skills stay visible and readonly; personal skills remain manageable', async () => {
    const ctx = new Context();
    const definitions = [
      { name: 'easywork-skill-creator', source: 'bundled', resourceBase: { kind: 'directory', path: 'D:\\EasyWork\\resources\\skills\\creator' } },
      { name: 'external-skill', source: 'bundled', resourceBase: { kind: 'directory', path: 'C:\\External\\skill' } },
      { name: 'personal-skill', source: 'user', path: 'C:\\Home\\agents\\skills\\personal-skill\\SKILL.md',
        resourceBase: { kind: 'directory', path: 'C:\\Home\\agents\\skills\\personal-skill' } },
    ].map(skill => ({ description: skill.name, provider: 'test', content: 'Instructions', invocation: { modelInvocable: true, userInvocable: true }, ...skill }));
    ctx.provide('skills', { list: async () => definitions, get: async name => definitions.find(skill => skill.name === name) });
    const manager = new SkillManager(ctx, { dshHome: 'C:\\Home', agentsHome: 'C:\\Home\\agents' });
    try {
      const listed = await manager.list();
      assert.deepEqual(listed.map(({ name, state, manageable }) => ({ name, state, manageable })), [
        { name: 'easywork-skill-creator', state: 'readonly', manageable: false },
        { name: 'external-skill', state: 'readonly', manageable: false },
        { name: 'personal-skill', state: 'enabled', manageable: true },
      ]);
      for (const name of ['easywork-skill-creator', 'external-skill']) {
        const detail = await manager.detail(name);
        assert.equal(detail.state, 'readonly'); assert.equal(detail.manageable, false);
      }
      const personal = await manager.detail('personal-skill');
      assert.equal(personal.manageable, true); assert.match(personal.document, /Personal instructions/u);
    } finally { await ctx.fiber.dispose(); }
  });
  await t.test('catalog rejects cross-volume, parent and root payloads and outside icons', async () => {
    const catalog = new SkillCatalogStore('C:\\Catalog');
    assert.equal(await catalog.payloadPath('inside'), 'C:\\Catalog\\payloads\\inside');
    assert.equal((await catalog.icon('inside')).contentType, 'image/svg+xml');
    for (const name of ['cross-volume', 'parent', 'root']) {
      assert.equal(await catalog.payloadPath(name), undefined, `${name} payload is outside catalog`);
      assert.equal(await catalog.icon(name), undefined, `${name} icon is outside catalog`);
    }
  });
});
