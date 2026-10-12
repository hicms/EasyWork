#!/usr/bin/env node
/** Local build/debug entry points. Keep the Desktop and Web dependency graphs separate. */
import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLocalProfileStage } from './local-profile-stage.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const webRoot = join(root, 'apps/web')
const usage = `Usage:
  node scripts/local-workflow.mjs build-win [--target=dir|installer] [--skip-install]
  node scripts/local-workflow.mjs web [--port=18989] [--skip-setup]

build-win: Default: build an unpacked Windows x64 application in apps/desktop/dist/win-unpacked.
           Run EasyWork.exe in that directory directly; keep all adjacent files.
           --target=installer builds Setup.exe instead.
           Requires native Windows; never launches the GUI or publishes a release.
web:       Install, build and prepare the independent Web preview, then serve on
           http://127.0.0.1:18989. Stop with Ctrl+C. --skip-setup reuses a prepared preview.
Requires Node ^22.19.0 or >=24.0.0, Git and Corepack.`

/** Parse only supported options, so a typo cannot silently change a build. */
export function parseOptions(args) {
  if (args.includes('--help')) return { help: true }
  const [command, ...flags] = args
  if (!['build-win', 'web'].includes(command)) throw new Error(usage)
  const options = { command, target: 'dir', port: 18989, skipInstall: false, skipSetup: false }
  const seen = new Set()
  for (const flag of flags) {
    const key = flag.split('=')[0]
    if (seen.has(key)) throw new Error(`Duplicate option: ${key}`)
    seen.add(key)
    if (command === 'build-win' && flag === '--skip-install') options.skipInstall = true
    else if (command === 'build-win' && /^--target=(dir|installer)$/u.test(flag)) {
      options.target = flag.slice('--target='.length)
    } else if (command === 'web' && flag === '--skip-setup') options.skipSetup = true
    else if (command === 'web' && /^--port=\d+$/u.test(flag)) {
      options.port = Number(flag.slice('--port='.length))
      if (options.port < 1 || options.port > 65535) throw new Error('Port must be 1..65535')
    } else throw new Error(`Unsupported option: ${flag}\n${usage}`)
  }
  return options
}

/** Run the selected workflow using an injectable command boundary for verification. */
export async function runWorkflow(options, run, {
  platform = process.platform,
  arch = process.arch,
  nodeVersion = process.versions.node,
  env = process.env,
  createProfileStage = createLocalProfileStage,
} = {}) {
  const [major, minor] = nodeVersion.split('.').map(Number)
  if (!((major === 22 && minor >= 19) || major >= 24)) {
    throw new Error(`Node ^22.19.0 or >=24.0.0 required; found ${nodeVersion}`)
  }
  const corepack = platform === 'win32' ? 'corepack.cmd' : 'corepack'
  const yarn = (args, environment = env) => run(corepack, ['yarn', ...args], root, environment)
  const pnpm = args => run(corepack, ['pnpm', ...args], webRoot, env)
  if (options.command === 'web') {
    if (!options.skipSetup) {
      await pnpm(['install', '--frozen-lockfile'])
      await pnpm(['build'])
      await pnpm(['preview:install'])
    }
    console.log(`Web preview port: ${options.port}. Open the complete token URL printed by DSH below; Ctrl+C to stop.`)
    await run(corepack, ['pnpm', 'preview'], webRoot, {
      ...env, EASYWORK_PREVIEW_PORT: String(options.port),
    })
    return
  }
  if (platform !== 'win32' || arch !== 'x64') {
    throw new Error('Windows packaging requires native Windows with x64 Node')
  }
  if (!options.skipInstall) {
    await yarn(['install', '--immutable'])
    await pnpm(['install', '--frozen-lockfile'])
  }
  await pnpm(['build'])
  await yarn(['check'])
  // Local package archives are transient; do not retain a new candidate copy on every build.
  const stage = createProfileStage(join(root, 'apps/desktop/build'))
  try {
    await run(process.execPath, [join(root, 'apps/desktop/scripts/pack-easywork-profile.mjs'), webRoot, stage.releaseDirectory], root, env)
    const runtimeEnv = {
      ...env, EASYWORK_RELEASE_DIRECTORY: stage.releaseDirectory,
      EASYWORK_RUNTIME_DIRECTORY: join(root, 'apps/desktop/build/easywork-runtime'),
      DSH_PACKAGE_CHECK_ALREADY_RAN: '1',
    }
    for (const task of ['prepare:easywork-runtime', 'prepare:easywork-primary-runtime', 'prepare:easywork-command']) {
      await yarn(['workspace', 'dsh-plugin-desktop', task], runtimeEnv)
    }
    const script = options.target === 'dir' ? 'package-dir.mjs' : 'package-win.ts'
    await run(process.execPath, [join(root, 'apps/desktop/scripts', script)], root, runtimeEnv)
    if (options.target === 'dir') {
      await run(process.execPath, [join(root, 'apps/desktop/scripts/verify-win-directory.ts')], root, runtimeEnv)
    }
  } finally {
    stage.cleanup()
  }
  console.log(`Windows ${options.target} build completed: ${join(root, options.target === 'dir' ? 'apps/desktop/dist/win-unpacked/EasyWork.exe' : 'apps/desktop/dist')}`)
}

function runCommand(command, args, cwd, env) {
  console.log(`> ${command} ${args.join(' ')}`)
  return new Promise((fulfill, reject) => {
    // Corepack's Windows entry point is a .cmd. Only fixed task names reach cmd.exe.
    const windowsCorepack = process.platform === 'win32' && command === 'corepack.cmd'
    const child = spawn(windowsCorepack ? (process.env.ComSpec ?? 'cmd.exe') : command,
      windowsCorepack ? ['/d', '/s', '/c', ['corepack', ...args].join(' ')] : args, {
      cwd, env, stdio: 'inherit', windowsHide: true,
    })
    const forwardInterrupt = () => child.kill('SIGINT')
    const forwardTermination = () => child.kill('SIGTERM')
    process.on('SIGINT', forwardInterrupt)
    process.on('SIGTERM', forwardTermination)
    child.once('error', reject)
    child.once('close', (code, signal) => {
      process.removeListener('SIGINT', forwardInterrupt)
      process.removeListener('SIGTERM', forwardTermination)
      if (code === 0) fulfill()
      else reject(new Error(`${args.join(' ')} failed (${signal ?? code})`))
    })
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseOptions(process.argv.slice(2))
    if (options.help) console.log(usage)
    else await runWorkflow(options, runCommand)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
