#!/usr/bin/env node

import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareOfficialRelease } from './official-desktop-release.mjs'
import { DSH_VERSION } from './runtime-version.mjs'

const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = process.platform === 'win32' ? 'win-x64'
  : process.platform === 'darwin' ? `mac-${process.env.WORKDSH_MAC_ARCH ?? process.arch}`
    : undefined
if (target === undefined || !['win-x64', 'mac-arm64', 'mac-x64'].includes(target)) {
  throw new Error(`Unsupported EasyWork primary runtime target: ${target ?? process.platform}`)
}
const output = join(desktopRoot, 'build', 'workdsh-runtime')
const profile = join(output, 'profiles', 'workdsh')
const profileMarker = join(profile, '.workdsh-desktop-release.json')
if (!existsSync(profileMarker) || JSON.parse(readFileSync(profileMarker, 'utf8')).harness !== DSH_VERSION) {
  throw new Error('Prepare and verify the target EasyWork Profile before its primary runtime')
}
const released = await prepareOfficialRelease(desktopRoot, target)
for (const name of ['primary-runtime', 'office-skills']) cpSync(join(released, 'runtime', name), join(output, name), { recursive: true, force: true, dereference: false })
const manifestPath = join(output, 'primary-runtime', 'runtime.json')
if (!existsSync(manifestPath) || !existsSync(join(output, 'office-skills'))) {
  throw new Error('Official primary runtime payload is incomplete')
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.desktopVersion !== DSH_VERSION || manifest.platform !== process.platform
  || manifest.arch !== target.slice(4)) {
  throw new Error(`Official primary runtime metadata does not match ${target} / ${DSH_VERSION}`)
}
const runtimePnpm = join(output, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.cjs')
if (manifest.pnpm !== '11.7.0' || !existsSync(runtimePnpm)) throw new Error('Official primary runtime must carry its pinned pnpm 11.7.0 JavaScript CLI')
const packagePath = join(profile, 'package.json')
if (!existsSync(packagePath)) throw new Error('EasyWork release profile must be prepared first')
const profilePackage = JSON.parse(readFileSync(packagePath, 'utf8'))
const packages = [
  '@deepseek-ai/dsh-tool-workspace-dependencies',
  '@deepseek-ai/dsh-skill-office',
]
if (packages.some(name => profilePackage.dependencies?.[name] !== DSH_VERSION
  || !existsSync(join(profile, 'node_modules', name, 'package.json'))
  || JSON.parse(readFileSync(join(profile, 'node_modules', name, 'package.json'), 'utf8')).version !== DSH_VERSION)) {
  throw new Error('Prepare the complete official Office/workspace dependency graph before its primary runtime; primary preparation must not change the installation manifest')
}
const patch = `# Official DeepSeek Harness Desktop workspace dependencies and Office skills.\n- insert:\n    - id: workspace-dependencies\n      name: '@deepseek-ai/dsh-tool-workspace-dependencies'\n      config:\n        source: !!js "process.env.DSH_BUNDLED_PRIMARY_RUNTIME"\n        root: !!js "process.getBuiltinModule('node:path').join(process.env.DSH_HOME, 'dsh-runtimes', 'dsh-primary-runtime')"\n    - id: skill-office\n      name: '@deepseek-ai/dsh-skill-office'\n      config:\n        assetRoot: !!js "process.getBuiltinModule('node:path').join(process.env.DSH_BUNDLED_PRIMARY_RUNTIME, '..', 'office-skills')"\n        node: !!js "process.getBuiltinModule('node:path').join(process.env.DSH_BUNDLED_PRIMARY_RUNTIME, 'dependencies', 'node', 'bin', process.platform === 'win32' ? 'node.exe' : 'node')"\n`
const patchPath = join(profile, 'cordis.patch.yml')
const currentPatch = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
const previousOfficial = currentPatch.indexOf('# Official DeepSeek Harness Desktop workspace dependencies and Office skills.')
const workdshPatch = previousOfficial === -1 ? currentPatch : currentPatch.slice(0, previousOfficial)
writeFileSync(patchPath, (workdshPatch.trim() === '[]' ? '' : workdshPatch) + patch)
console.log(`Prepared official DeepSeek Harness ${target} primary runtime at ${output}`)
