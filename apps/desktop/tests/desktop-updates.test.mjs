import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { test } from 'node:test'
import { DesktopUpdateController } from '../src/desktop-update-controller.ts'
import { ShutdownCoordinator } from '../src/shutdown-coordinator.ts'
import { stopRuntimeProcess, watchRuntimeShutdown } from '../src/runtime-shutdown.ts'
import { releaseDownloadUrl, selectRelease, updateChannel } from '../src/update-policy.ts'

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function fixture(prepareInstall = async () => {}, mode = 'signed') {
  const errors = [], calls = []
  const updater = Object.assign(new EventEmitter(), {
    setFeedURL: feed => calls.push(feed),
    checkForUpdates: async () => ({ updateInfo: { version: '2.1.0-alpha.2' } }),
    downloadUpdate: async () => { calls.push('download'); updater.emit('update-downloaded', {}) },
    validateCandidate: async version => { calls.push(['verify', version]) },
    launchAndQuit: async () => { calls.push(['install']) },
  })
  const controller = new DesktopUpdateController(updater, {
    currentVersion: '2.1.0-alpha.1', mode, discover: async () => '2.1.0-alpha.2', changed: () => {},
    error: error => errors.push(error), prepareInstall, installFailed: () => calls.push('install-failed'),
  })
  return { updater, controller, errors, calls }
}

test('streams reject drafts, beta, stable promotion, noncanonical versions and downgrades', () => {
  const release = (tag_name, prerelease, draft = false) => ({ tag_name, prerelease, draft })
  const list = [release('v3.0.0', false), release('v2.2.0-alpha.1', true, true), release('v2.1.0-beta.1', true),
    release('v2.1.0-alpha.10', true), release('v2.1.0-alpha.9', true), release('v02.1.0-alpha.11', true), release('v2.0.9', false)]
  assert.equal(selectRelease(list, '2.1.0-alpha.1'), '2.1.0-alpha.10')
  assert.equal(selectRelease(list, '2.1.0'), '3.0.0')
  assert.equal(selectRelease(list, '3.0.0'), undefined)
  assert.throws(() => updateChannel('2.1.0-beta.1'))
  assert.throws(() => selectRelease({}, '2.1.0'))
  list.push(release('acceptance-v2.1.0-alpha.11', true), release('acceptance-v2.1.0-alpha.12', true, true), release('acceptance-v3.0.0', false))
  assert.equal(selectRelease(list, '2.1.0-alpha.1'), '2.1.0-alpha.10')
  assert.equal(selectRelease(list, '2.1.0-alpha.1', 'unsigned-acceptance'), '2.1.0-alpha.11')
  assert.throws(() => selectRelease(list, '2.1.0', 'unsigned-acceptance'))
})

test('check automatically downloads once; explicit restart waits for safe close before single install', async () => {
  const stop = deferred(), f = fixture(() => { f.calls.push('stop'); return stop.promise })
  const first = f.controller.check(), second = f.controller.check()
  assert.equal(first, second)
  await first
  assert.equal(f.controller.state, 'downloaded')
  assert.equal(f.calls.filter(call => call === 'download').length, 1)
  assert.equal(f.calls[0].useMultipleRangeRequest, false)
  assert.equal(f.updater.previousBlockmapBaseUrlOverride, releaseDownloadUrl('2.1.0-alpha.1'))
  assert.equal(f.updater.allowDowngrade, false)
  await f.controller.download()
  assert.equal(f.controller.state, 'downloaded')
  const install = f.controller.install()
  assert.equal(install, f.controller.install())
  assert.equal(f.controller.state, 'verifying')
  assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === 'install').length, 0)
  stop.resolve(); await install
  assert.deepEqual(f.calls.at(-1), ['install'])
  await f.controller.install()
  assert.equal(f.calls.filter(call => Array.isArray(call) && call[0] === 'install').length, 1)
  const acceptance = fixture(undefined, 'unsigned-acceptance')
  await acceptance.controller.check()
  assert.equal(acceptance.calls[0].url, releaseDownloadUrl('2.1.0-alpha.2', 'unsigned-acceptance'))
  assert.equal(acceptance.updater.previousBlockmapBaseUrlOverride, releaseDownloadUrl('2.1.0-alpha.1', 'unsigned-acceptance'))
})

test('unsafe shutdown blocks installation and preserves an explicit failure', async () => {
  const f = fixture(async () => { throw new Error('unacknowledged') })
  await f.controller.check(); await f.controller.download(); await f.controller.install()
  assert.equal(f.controller.state, 'error')
  assert.equal(f.calls.some(call => Array.isArray(call) && call[0] === 'install'), false)
  assert.match(f.errors[0].message, /unacknowledged/u)
})

test('ordinary quit during verification never starts update shutdown', async () => {
  let stops = 0
  const f = fixture(async () => { stops++ })
  await f.controller.check(); await f.controller.download()
  const verify = deferred(); f.updater.validateCandidate = () => verify.promise
  const pending = f.controller.install(); f.controller.suspend(); verify.resolve()
  await pending; assert.equal(stops, 0)
})

test('offline check, mismatched manifest and failed download never offer installation', async () => {
  const f = fixture()
  f.updater.checkForUpdates = async () => { throw new Error('offline') }
  await f.controller.check(); assert.equal(f.controller.state, 'error')
  f.updater.checkForUpdates = async () => ({ updateInfo: { version: '3.0.0' } })
  await f.controller.check(); assert.equal(f.controller.state, 'error')
  f.updater.checkForUpdates = async () => ({ updateInfo: { version: '2.1.0-alpha.2' } })
  f.updater.downloadUpdate = async () => { f.updater.emit('error', new Error('network')); throw new Error('network') }
  await f.controller.check(); await f.controller.install()
  assert.equal(f.controller.state, 'error'); assert.equal(f.calls.some(call => Array.isArray(call) && call[0] === 'install'), false)
  assert.equal(f.errors.length, 3)
})

test('ordinary quit suppresses in-flight check and download completion', async () => {
  const f = fixture(), download = deferred()
  f.updater.downloadUpdate = () => download.promise
  const pending = f.controller.check()
  await new Promise(resolve => setImmediate(resolve))
  f.updater.emit('download-progress', { percent: 42 })
  assert.equal(f.controller.percent, 42)
  f.controller.suspend(); download.resolve([]); await pending; await f.controller.install()
  assert.notEqual(f.controller.state, 'downloaded'); assert.equal(f.calls.some(call => Array.isArray(call) && call[0] === 'install'), false)
})

test('coordinator coalesces close requests and refuses reuse of ordinary quit for update', async () => {
  const gate = deferred(), calls = [], coordinator = new ShutdownCoordinator(reason => { calls.push(reason); return gate.promise })
  const quit = coordinator.request('quit'), update = coordinator.request('update')
  gate.resolve(); await quit
  await assert.rejects(update, /普通退出/u)
  await assert.rejects(coordinator.request('update'), /普通退出/u)
  assert.deepEqual(calls, ['quit'])
})

function childFixture() {
  return Object.assign(new EventEmitter(), { connected: true, exitCode: null, signalCode: null, send(message, callback) { this.message = message; callback(null) } })
}
test('strict stop needs acknowledgement AND natural close, with drained process request', async () => {
  const child = childFixture(); watchRuntimeShutdown(child)
  const pending = stopRuntimeProcess(child, true)
  assert.equal(child.message.requireDrainedProcesses, true)
  child.emit('message', { type: 'easywork-shutdown-complete' })
  child.emit('close', 0, null)
  assert.equal(await pending, 'graceful')
})
test('exit zero without acknowledgement is unsafe; timeout does not kill the process', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const child = childFixture(); watchRuntimeShutdown(child)
  const failed = stopRuntimeProcess(child, true)
  child.exitCode = 0 // Node sets this before emitting close; model the same lifecycle on every OS.
  child.emit('close', 0, null)
  await assert.rejects(failed, /暂缓安装/u)
  const running = childFixture(); let killed = false; running.kill = () => { killed = true }
  watchRuntimeShutdown(running)
  const timeout = stopRuntimeProcess(running, true)
  let settled = false
  void timeout.then(() => { settled = true }, () => { settled = true })
  t.mock.timers.tick(8001)
  await Promise.resolve()
  assert.equal(settled, false)
  assert.equal(killed, false)
  t.mock.timers.tick(12000)
  await assert.rejects(timeout, /暂缓安装/u)
  assert.equal(killed, false)
  assert.equal(await stopRuntimeProcess(child), 'forced')
})

test('ordinary shutdown allows delayed natural close and only forces cleanup at its deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const child = childFixture(); watchRuntimeShutdown(child)
  const pending = stopRuntimeProcess(child)
  assert.equal(child.message.requireDrainedProcesses, false)
  child.emit('message', { type: 'easywork-shutdown-complete' })
  t.mock.timers.tick(9000)
  child.emit('close', 0, null)
  assert.equal(await pending, 'graceful')
  const stuck = childFixture()
  stuck.kill = signal => { stuck.signalCode = signal; stuck.emit('exit', null, signal); return true }
  watchRuntimeShutdown(stuck)
  let finished = false
  const timeout = stopRuntimeProcess(stuck).then(result => { finished = true; return result })
  t.mock.timers.tick(19999)
  await Promise.resolve()
  assert.equal(finished, false)
  t.mock.timers.tick(1)
  assert.equal(await timeout, 'forced')
})
