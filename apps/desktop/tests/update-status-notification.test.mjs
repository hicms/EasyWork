import assert from 'node:assert/strict'
import { test } from 'node:test'
import { showUpdateStartedNotification } from '../src/update-status-notification.ts'

function port({ supported = true, fail = false } = {}) {
  const calls = []
  return {
    calls,
    isSupported: () => supported,
    create: options => {
      calls.push(options)
      if (fail) throw new Error('notification unavailable')
      return { show: () => calls.push('shown') }
    },
  }
}

test('update notification explains the detached install and follows the UI language', () => {
  const zh = port(); assert.equal(showUpdateStartedNotification('zh-CN', zh), true)
  assert.deepEqual(zh.calls, [{ title: 'EasyWork', body: '正在安装更新，完成后 EasyWork 会自动重新打开。' }, 'shown'])
  const en = port(); assert.equal(showUpdateStartedNotification('en-US', en), true)
  assert.deepEqual(en.calls, [{ title: 'EasyWork', body: 'Installing the update. EasyWork will reopen when it is finished.' }, 'shown'])
})

test('notification failures and unsupported systems never block the update', () => {
  const unsupported = port({ supported: false }); assert.equal(showUpdateStartedNotification('zh-CN', unsupported), false); assert.deepEqual(unsupported.calls, [])
  const failed = port({ fail: true }); assert.equal(showUpdateStartedNotification('zh-CN', failed), false); assert.equal(failed.calls.length, 1)
})
