/** The installed command delegates to the official CLI in the personal space. */
import { readFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { PRODUCT_NAME, USER_DATA_DIRECTORY_NAME } from './startup-contract.ts'

export interface CommandSpace { mode: 'personal'; home: string; label: string }
export function selectCommandSpace(context: { personalHome: string; active?: unknown }, request?: string): CommandSpace {
  if (!isAbsolute(context.personalHome)) throw new Error('Invalid personal command space')
  if (request !== undefined && request !== 'personal') throw new Error(`${PRODUCT_NAME} 仅支持个人工作区`)
  return { mode: 'personal', home: context.personalHome, label: '个人工作区' }
}
async function main(): Promise<void> {
  const userData = process.env.WORKDSH_DESKTOP_USER_DATA ?? (process.platform === 'win32' ? join(process.env.APPDATA ?? '', USER_DATA_DIRECTORY_NAME) : join(homedir(), 'Library/Application Support', USER_DATA_DIRECTORY_NAME))
  const context = JSON.parse(readFileSync(join(userData, 'command-context.json'), 'utf8')) as { personalHome: string; active?: CommandSpace }
  const args = process.argv.slice(2), spaceOption = args.findIndex(value => value.startsWith('--workdsh-space='))
  const request = spaceOption < 0 ? undefined : args.splice(spaceOption, 1)[0]!.slice('--workdsh-space='.length)
  const space = selectCommandSpace(context, request)
  const launcher = join(space.home, '.workdsh-launch.mjs')
  if (!existsSync(launcher)) throw new Error('请先在 Desktop 打开此工作区，完成官方 Profile 初始化')
  const runtime = dirname(dirname(dirname(fileURLToPath(import.meta.url)))), primary = join(runtime, 'primary-runtime')
  const basePatch = join(runtime, 'profiles/workdsh/cordis.patch.yml')
  const patches = existsSync(basePatch) ? ['--patch', basePatch] : []
  const env = { ...process.env, DSH_HOME: space.home, DSH_AGENTS_HOME: join(space.home, 'agents'), DSH_BUNDLED_PRIMARY_RUNTIME: primary, ELECTRON_RUN_AS_NODE: undefined }
  process.stderr.write(`${PRODUCT_NAME}：${space.label}\n`)
  const child = spawn(process.execPath, [launcher, '--profile', 'workdsh', ...patches, ...args], { cwd: space.home, env, stdio: 'inherit' })
  child.once('error', error => { process.stderr.write(error.message + '\n'); process.exitCode = 1 })
  child.once('exit', code => { process.exitCode = code ?? 1 })
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main().catch(error => { process.stderr.write(String(error instanceof Error ? error.message : error) + '\n'); process.exitCode = 1 })
