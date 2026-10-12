import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { sharedProfileFeatures } from '../scripts/shared-profile-features.mjs';

test('Web preview resolves every shared feature to its repository-owned package after migration', async () => {
  const webRoot = fileURLToPath(new URL('../', import.meta.url));
  const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const canonical = JSON.parse(await readFile(resolve(repositoryRoot, 'profiles/shared/easywork-features.json'), 'utf8'));
  const preview = await sharedProfileFeatures();
  assert.equal(preview.features.length, canonical.features.length);
  for (const [index, feature] of preview.features.entries()) {
    const directory = resolve(webRoot, feature.directory);
    assert.equal(directory, resolve(repositoryRoot, canonical.features[index].directory));
    const manifest = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
    assert.equal(manifest.name, feature.name);
  }
});
