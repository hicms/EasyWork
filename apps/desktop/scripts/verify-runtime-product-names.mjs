/** Audit the actual Skill registry and MCP tool schemas in an isolated installed runtime. */
import { spawn } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { materializeRuntimeProfile, officialHostLauncher } from '../src/local-runtime.ts'
import { assertCurrentProductNames } from '../../../scripts/verify-product-artifacts.mjs'
import { ensureRuntimeAuditProcess } from './runtime-audit-process.mjs'
import { archivedRuntimeProfile } from '../src/runtime-layout.ts'

const runtime = resolve(process.argv[2] ?? fileURLToPath(new URL('../build/easywork-runtime', import.meta.url)))
const profile = ensureRuntimeAuditProcess(runtime), primary = join(runtime, 'primary-runtime')
const executable = join(primary, 'dependencies/node/bin', process.platform === 'win32' ? 'node.exe' : 'node')
const pnpm = join(primary, 'dependencies/pnpm/bin/pnpm.cjs')
const home = mkdtempSync(join(tmpdir(), 'easywork-name-registry-'))
let child, finished, output = ''
const scrub = text => text.replace(/([?&]token=)[^\s]+/gu, '$1[redacted]')
try {
  materializeRuntimeProfile(profile, home)
  const patch = join(home, 'headless.patch.yml')
  writeFileSync(patch, '- id: webserver\n  config:\n    host: 127.0.0.1\n    port: 0\n')
  const launcher = officialHostLauncher(profile, home, executable, pnpm, [join(profile, 'cordis.patch.yml'), patch])
  appendFileSync(launcher, `
const deadline = Date.now() + 15000;
while (!ctx.tools.schemas().some(tool => tool.name === 'mcp__easywork-example__search_catalog')) {
  if (Date.now() > deadline) throw new Error('Bundled MCP tool discovery timed out');
  await new Promise(resolve => setTimeout(resolve, 50));
}
const skills = (await ctx.skills.list({ cwd: ${JSON.stringify(home)} })).map(skill => skill.name).sort();
const tools = ctx.tools.schemas().map(tool => tool.name).sort();
process.send?.({ type: 'easywork-name-inventory', skills, tools });
`)
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(?:KEY|SECRET|TOKEN|PASSWORD|DSH_|EASYWORK_|^NODE_OPTIONS$|^NODE_PATH$)/iu.test(key)))
  Object.assign(env, { HOME: home, USERPROFILE: home, DSH_HOME: home, DSH_AGENTS_HOME: join(home, 'agents'), DSH_BUNDLED_PRIMARY_RUNTIME: primary, DSH_TELEMETRY_DISABLED: '1' })
  const inventory = await new Promise((resolveInventory, reject) => {
    child = spawn(archivedRuntimeProfile(profile) ? process.execPath : executable, ['--expose-internals', launcher, '--no-open'], { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true })
    finished = new Promise(resolveExit => child.once('close', resolveExit))
    const timer = setTimeout(() => reject(new Error('Registry audit timed out: ' + scrub(output).slice(-3000))), 60000)
    child.stdout.on('data', chunk => { output = (output + chunk).slice(-32000) })
    child.stderr.on('data', chunk => { output = (output + chunk).slice(-32000) })
    child.on('message', message => {
      if (message?.type === 'easywork-name-inventory') { clearTimeout(timer); resolveInventory(message) }
    })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Registry audit process exited (' + code + '): ' + scrub(output).slice(-3000))) })
  })
  assertCurrentProductNames(JSON.stringify(inventory), 'installed Skill and tool registries')
  for (const name of ['easywork-expert-manager', 'easywork-skill-creator', 'easywork-ppt-design', 'easywork-word-design', 'easywork-excel-design', 'easywork-web-design']) {
    if (!inventory.skills.includes(name)) throw new Error('Missing native Skill command: /' + name)
  }
  for (const name of ['mcp__easywork-example__search_catalog', 'mcp__easywork-example__connector_status']) {
    if (!inventory.tools.includes(name)) throw new Error('Missing MCP tool schema: ' + name)
  }
  const nativeComputerTools = inventory.tools.filter(name => name.startsWith('cua_driver_native__'))
  if (process.platform === 'win32' && nativeComputerTools.length === 0) throw new Error('The native computer-use provider did not register its tools: ' + scrub(output).slice(-6000))
  console.log(JSON.stringify({ commands: inventory.skills.filter(name => name.startsWith('easywork-')).map(name => '/' + name), mcpTools: inventory.tools.filter(name => name.startsWith('mcp__easywork-')), nativeComputerTools: nativeComputerTools.length, allRegistryNamesChecked: inventory.skills.length + inventory.tools.length, modelCallsRequested: 0, guiLaunchRequested: false }))
} finally {
  if (child && child.exitCode === null) {
    child.send({ type: 'easywork-shutdown' })
    const timer = setTimeout(() => child.kill(), 10000)
    await finished
    clearTimeout(timer)
  }
  const part = relative(tmpdir(), home)
  if (isAbsolute(part) || part.startsWith('..') || !part.startsWith('easywork-name-registry-')) throw new Error('Unsafe temporary Home cleanup')
  rmSync(home, { recursive: true, force: true })
}
