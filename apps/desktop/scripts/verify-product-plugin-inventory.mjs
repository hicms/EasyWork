#!/usr/bin/env node

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { CATALOG_PACKAGES, UNSUPPORTED_ENTERPRISE_PACKAGES, PRODUCT_PACKAGES } from './easywork-package-boundary.mjs'
import { ensureRuntimeAuditProcess } from './runtime-audit-process.mjs'

const runtime = resolve(process.argv[2] ?? fileURLToPath(new URL('../build/easywork-runtime', import.meta.url)))
const source = ensureRuntimeAuditProcess(runtime)
const profile = resolve(process.argv[3] ?? source)
const installedInProfile = profile === source
const probe = mkdtempSync(join(tmpdir(), 'easywork-inventory-'))
const config = join(probe, 'cordis.yml')
const expected = PRODUCT_PACKAGES
const anchor = join(source, 'profile-installation.json')
if (!existsSync(anchor)) throw new Error(`Missing bundled DSH installation: ${anchor}`)
const installation = JSON.parse(readFileSync(anchor, 'utf8'))
for (const name of UNSUPPORTED_ENTERPRISE_PACKAGES) {
 if(existsSync(join(source,'node_modules',name,'package.json'))||installation.dependencies?.[name]||installation.peerDependencies?.[name])throw new Error('Base installer must not preinstall enterprise plugins: '+name)
}

process.env.DSH_HOME = runtime
const packages = join(source, 'node_modules', '@deepseek-ai')
const { boot } = await import(pathToFileURL(join(packages, 'dsh-app-boot', 'lib', 'index.js')).href)
const { default: PluginManager } = await import(pathToFileURL(join(packages, 'dsh-plugin-manager', 'lib', 'index.js')).href)

let ctx
try {
  writeFileSync(config, JSON.stringify([{ id: 'manager', name: 'cordis:manager' }]))
  ctx = await boot('dsh', config, [], root => {
    root.provide('profileContext', {
      name: 'easywork', dir: profile, home: runtime, cwd: runtime,
      patchPath: join(profile, 'cordis.patch.yml'), installAnchor: anchor,
      startedBundles: [], overlays: [], telemetryDisabledEnv: undefined,
    })
    root.loader.builtins.manager = PluginManager
  })
  const allBundles = await ctx.pluginManager.listBundles()
  const bundles = allBundles.filter(row => row.name.startsWith('easywork-'))
  const names = bundles.map(row => row.name).sort()
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`Plugin manager exposes ${names.join(', ') || '(none)'}; expected ${expected.join(', ')}`)
  }
  for (const bundle of bundles) {
    if (!bundle.enabled || bundle.installed !== installedInProfile || bundle.removable || bundle.error) {
      throw new Error(`EasyWork product bundle is inactive or invalid: ${bundle.name}: ${JSON.stringify(bundle)}`)
    }
  }
  for (const name of Object.keys(CATALOG_PACKAGES)) {
    const bundle = allBundles.find(row => row.name === name)
    if (!bundle?.enabled || bundle.installed !== installedInProfile || bundle.error) {
      throw new Error(`Community catalog integration is inactive or invalid: ${name}: ${JSON.stringify(bundle)}`)
    }
  }
  console.log(`Verified plugin manager exposes exactly five ${installedInProfile ? 'installed' : 'installation-provided'} EasyWork product bundles: ${names.join(', ')}`)
} finally {
  try {
    await ctx?.fiber.dispose()
  } finally {
    const part = relative(tmpdir(), probe)
    if (isAbsolute(part) || part.startsWith('..') || !part.startsWith('easywork-inventory-')) throw new Error('Unsafe inventory probe cleanup')
    rmSync(probe, { recursive: true, force: true })
  }
}
