import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseOptions, runWorkflow } from './local-workflow.mjs'

function recorder() {
  const calls = []
  return { calls, run: async (command, args, cwd, env) => calls.push({ command, args, cwd, env }) }
}

test('default Windows build creates only a runnable directory and cleans temporary archives', async () => {
  const { calls, run } = recorder()
  let cleaned = false
  const releaseDirectory = 'temporary-local-archives'
  await runWorkflow(parseOptions(['build-win']), run, {
    platform: 'win32', arch: 'x64', nodeVersion: '24.14.0',
    env: { EASYWORK_RELEASE_DIRECTORY: 'previous-candidate' },
    createProfileStage: () => ({ releaseDirectory, cleanup: () => { cleaned = true } }),
  })
  const install = calls.filter(call => call.args.includes('install'))
  assert.deepEqual(install.map(call => call.args), [
    ['yarn', 'install', '--immutable'], ['pnpm', 'install', '--frozen-lockfile'],
  ])
  assert.ok(install[1].cwd.endsWith('apps\\web') || install[1].cwd.endsWith('apps/web'))
  const pack = calls.findIndex(call => call.args[0].endsWith('pack-easywork-profile.mjs'))
  const check = calls.findIndex(call => call.args.join(' ') === 'yarn check')
  assert.ok(check < pack)
  assert.equal(calls[pack].args[2], releaseDirectory)
  const artifacts = calls.filter(call => /package-(?:dir\.mjs|win(?:-portable)?\.ts)$/u.test(call.args[0]))
  assert.equal(artifacts.length, 1)
  assert.ok(artifacts[0].args[0].endsWith('package-dir.mjs'))
  for (const call of artifacts) {
    assert.equal(call.env.EASYWORK_RELEASE_DIRECTORY, calls[pack].args[2])
    assert.equal(call.env.DSH_PACKAGE_CHECK_ALREADY_RAN, '1')
  }
  assert.ok(calls.at(-1).args[0].endsWith('verify-win-directory.ts'))
  assert.ok(cleaned)
  assert.ok(!calls.some(call => call.args.includes('start') || call.args.includes('dev')))
})

test('an installer is built only when selected and packaging failures still clean temporary archives', async () => {
  const calls = []
  let cleaned = false
  await assert.rejects(runWorkflow(parseOptions(['build-win', '--target=installer', '--skip-install']), async (_command, args) => {
    calls.push(args)
    if (args[0].endsWith('package-win.ts')) throw new Error('package failed')
  }, {
    platform: 'win32', arch: 'x64', nodeVersion: '24.14.0',
    createProfileStage: () => ({ releaseDirectory: 'temporary-local-archives', cleanup: () => { cleaned = true } }),
  }), /package failed/u)
  assert.ok(cleaned)
  assert.ok(!calls.some(args => args[0].endsWith('package-dir.mjs') || args[0].endsWith('package-win-portable.ts')))
  const enabled = recorder()
  await runWorkflow(parseOptions(['build-win', '--target=installer', '--skip-install', '--acceptance-updates']), enabled.run, {
    platform: 'win32', arch: 'x64', nodeVersion: '24.14.0',
    createProfileStage: () => ({ releaseDirectory: 'temporary-local-archives', cleanup() {} }),
  })
  const build = enabled.calls.at(-1)
  assert(build.args[0].endsWith('windows-installer.mjs')); assert.equal(build.args[1], '--updates')
  assert.match(build.cwd, /apps[\\/]desktop$/u)
})

test('Windows builds reject a non-Windows host before installing or building', async () => {
  const { calls, run } = recorder()
  await assert.rejects(runWorkflow(parseOptions(['build-win']), run, {
    platform: 'darwin', arch: 'arm64', nodeVersion: '24.14.0',
  }), /native Windows/u)
  assert.equal(calls.length, 0)
})

test('a failed check prevents runtime preparation and packaging', async () => {
  const calls = []
  await assert.rejects(runWorkflow(parseOptions(['build-win', '--skip-install']), async (_command, args) => {
    calls.push(args)
    if (args.includes('check')) throw new Error('check failed')
  }, { platform: 'win32', arch: 'x64', nodeVersion: '24.14.0' }), /check failed/u)
  assert.deepEqual(calls, [['pnpm', 'build'], ['yarn', 'check']])
})

test('Web uses only its pnpm workspace and forwards the selected port', async () => {
  const { calls, run } = recorder()
  await runWorkflow(parseOptions(['web', '--port=19000']), run, { env: {}, nodeVersion: '24.14.0' })
  assert.deepEqual(calls.map(call => call.args), [
    ['pnpm', 'install', '--frozen-lockfile'], ['pnpm', 'build'],
    ['pnpm', 'preview:install'], ['pnpm', 'preview'],
  ])
  assert.ok(calls.every(call => call.cwd === calls[0].cwd))
  assert.equal(calls.at(-1).env.EASYWORK_PREVIEW_PORT, '19000')
  const prepared = recorder()
  await runWorkflow(parseOptions(['web', '--skip-setup']), prepared.run, { nodeVersion: '24.14.0' })
  assert.deepEqual(prepared.calls.map(call => call.args), [['pnpm', 'preview']])
})

test('invalid flags and ports fail instead of silently building another target', () => {
  for (const args of [
    ['build-win', '--target=zip'], ['build-win', '--target=portable'], ['build-win', '--target=all'], ['web', '--port=0'], ['web', '--port=65536'],
    ['web', '--skip-install'], ['web', '--port=18989', '--port=19000'],
    ['build-win', '--acceptance-updates'], ['web', '--acceptance-updates'],
  ]) assert.throws(() => parseOptions(args))
})
