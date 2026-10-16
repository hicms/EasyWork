import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import test from 'node:test'
import {
  defaultWorkspacePath,
  initializeEasyWorkDefaultWorkspace,
  resolveWorkspaceRoot,
} from '../../../packages/bundle/src/workspace-default.ts'

test('EasyWork default workspace uses its product directory', async t => {
  const documents = await mkdtemp(join(tmpdir(), 'easywork-documents-'))
  t.after(() => rm(documents, { recursive: true, force: true }))
  assert.equal(resolveWorkspaceRoot({ EASYWORK_DOCUMENTS_DIRECTORY: documents }), join(documents, 'EasyWork'))
  assert.equal(defaultWorkspacePath(join(documents, 'EasyWork')), join(documents, 'EasyWork', 'default-workspace'))
})

test('an explicit EasyWork workspace root wins and is normalized', () => {
  const root = normalize(join(tmpdir(), 'easywork-root', '..', 'easywork-root'))
  assert.equal(resolveWorkspaceRoot({ EASYWORK_WORKSPACE_ROOT: root }), root)
})

test('relative workspace overrides fail before registry mutation', async () => {
  const registry = { initializeDefault: async () => { throw new Error('must not be called') } }
  assert.throws(() => resolveWorkspaceRoot({ EASYWORK_WORKSPACE_ROOT: 'relative-root' }), /EASYWORK_WORKSPACE_ROOT must be an absolute path/)
  await assert.rejects(() => initializeEasyWorkDefaultWorkspace(registry, { EASYWORK_WORKSPACE_ROOT: 'relative-root' }), /EASYWORK_WORKSPACE_ROOT must be an absolute path/)
})

test('registry remains the owner of first-use eligibility and persistence', async () => {
  const calls = []
  const registry = {
    initializeDefault: async resolveDirectory => {
      calls.push(await resolveDirectory())
      return { existing: true }
    },
  }
  const result = await initializeEasyWorkDefaultWorkspace(registry, { EASYWORK_WORKSPACE_ROOT: join(tmpdir(), 'easywork-root') })
  assert.deepEqual(result, { existing: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0], join(tmpdir(), 'easywork-root', 'default-workspace'))
})
