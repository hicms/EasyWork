/** Explicit GUI acceptance, using only an isolated test Home and the unpacked candidate. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const local = process.argv.length === 3 && process.argv[2] === '--local'
if (process.platform !== 'win32' || (process.env.CI !== 'true' && !local)) throw new Error('Use explicitly dispatched Windows CI or --local for GUI acceptance')
const root = resolve(import.meta.dirname, '..')
const output = join(root, 'dist', 'release')
const userData = join(root, 'build', 'release-acceptance-home')
mkdirSync(output, { recursive: true })
const require = createRequire(new URL('../../web/package.json', import.meta.url))
const { _electron } = require('@playwright/test')
const env = { ...process.env, EASYWORK_DESKTOP_USER_DATA: userData, DSH_TELEMETRY_DISABLED: '1' }
for (const name of Object.keys(env)) if (/TOKEN|PASSWORD|SECRET|CSC_|^NODE_OPTIONS$|^NODE_PATH$|^EASYWORK_DSH_HOME$/u.test(name)) delete env[name]
const startedAt = Date.now()
const candidate = await _electron.launch({ executablePath: join(root, 'dist/win-unpacked/EasyWork.exe'), args: ['--lang=zh-CN'], env, timeout: 120_000 })
const mainPid = await candidate.evaluate(() => process.pid)
const checks = {}
try {
  assert.equal(await candidate.evaluate(({ app }) => app.getPath('userData')), userData)
  const page = await candidate.firstWindow({ timeout: 120_000 })
  await page.waitForURL('easywork-app://app/**')
  await page.getByText(/^(新会话|New conversation|New chat)$/u).first().waitFor({ timeout: 120_000 })
  checks.personalStartup = true
  assert.equal(await page.getByRole('heading', { name: '选择使用方式' }).count(), 0)
  checks.noModePicker = true
  await page.getByText(/^(项目|Projects)$/u).first().waitFor()
  checks.projectsEntry = true
  await page.getByRole('button', { name: '登录 EasyWork', exact: true }).click()
  await page.getByRole('heading', { name: 'EasyWork 账号与模型', exact: true }).waitFor()
  const settings = page.getByRole('dialog', { name: /^(设置|Settings)$/u })
  await settings.getByRole('button', { name: /^(内置插件|Built-in plugins)$/u }).waitFor()
  await settings.getByRole('button', { name: /^(关闭|Close)$/u, exact: true }).click()
  checks.settingsAndPlugins = true
  await page.evaluate(async () => {
    const call = async (endpoint, payload) => {
      const response = await fetch('/api/easywork-projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint, payload }) })
      const result = await response.json()
      if (!result.ok) throw new Error('Project operation failed: ' + endpoint)
      return result.value
    }
    const created = await call('create', { name: 'Windows release acceptance' })
    await call('get', { projectId: created.project.id })
    await call('archive', { projectId: created.project.id })
  })
  checks.projectCreateReadArchive = true
  await page.screenshot({ path: join(output, 'personal.png'), fullPage: true })
  const closed = candidate.waitForEvent('close', { timeout: 20_000 })
  await candidate.evaluate(({ app }) => { setImmediate(() => app.quit()) })
  await closed
  const stops = readFileSync(join(userData, 'logs', 'startup.log'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    .filter(row => row.pid === mainPid && Date.parse(row.time) >= startedAt && row.event === 'host.stopped')
  assert.equal(stops.length, 1, 'Current candidate must record its own Host shutdown')
  assert.equal(stops[0].result, 'graceful')
  checks.gracefulQuit = true
  writeFileSync(join(output, 'ui-acceptance.json'), JSON.stringify({ checks, userDataIsolated: true, ok: true }, null, 2) + '\n')
} finally { await candidate.close().catch(() => {}) }
