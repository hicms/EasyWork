#!/usr/bin/env node

import { existsSync, lstatSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { listPackage, statFile } from '@electron/asar'

const [applicationPath, outputPath] = process.argv.slice(2)
if (!applicationPath || !outputPath) {
  throw new Error('usage: node report-package-footprint.mjs <unpacked-app-directory> <output.json>')
}

const application = resolve(applicationPath)
const output = resolve(outputPath)
const resources = existsSync(join(application, 'Contents', 'Resources'))
  ? join(application, 'Contents', 'Resources')
  : join(application, 'resources')
const runtime = join(resources, 'easywork-runtime')
const profileArchive = join(resources, 'app.asar')
const archived = existsSync(profileArchive) && !existsSync(join(runtime, 'profiles', 'easywork'))
const profileModules = archived ? join(profileArchive + '.unpacked', 'profiles', 'easywork', 'node_modules') : join(runtime, 'profiles', 'easywork', 'node_modules')
const groups = new Map()
const packages = new Map()
const extensions = new Map()
const totals = { bytes: 0, files: 0, links: 0 }

function add(map, key, bytes) {
  const current = map.get(key) ?? { bytes: 0, files: 0 }
  current.bytes += bytes
  current.files++
  map.set(key, current)
}

function groupFor(path) {
  const within = relative(runtime, path)
  if (within.startsWith('..' + sep) || within === '..') return archived ? 'electron-carrier-and-profile' : 'electron-and-carrier'
  const parts = within.split(sep)
  if (parts[0] === 'profiles' && parts[1] === 'easywork' && parts[2] === 'node_modules') return 'profile-node-modules'
  if (parts[0] === 'primary-runtime') return 'primary-runtime'
  if (parts[0] === 'package-cache') return 'package-cache'
  return 'other-runtime'
}

function packageFor(path) {
  for (const modules of [profileModules, join(resources, 'node_modules')]) {
    const within = relative(modules, path)
    if (within.startsWith('..' + sep) || within === '..') continue
    const parts = within.split(sep)
    if (parts[0] === '.pnpm') return '.pnpm'
    return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  }
  return null
}

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      visit(path)
      continue
    }
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) {
      totals.links++
      continue
    }
    if (!stat.isFile()) continue
    totals.bytes += stat.size
    totals.files++
    add(groups, groupFor(path), stat.size)
    const name = packageFor(path)
    if (name) add(packages, name, stat.size)
    const extension = entry.name.endsWith('.d.ts') ? '.d.ts'
      : entry.name.endsWith('.d.mts') ? '.d.mts'
        : entry.name.endsWith('.d.cts') ? '.d.cts'
          : entry.name.endsWith('.map') ? '.map'
            : entry.name.endsWith('.pdb') ? '.pdb'
              : null
    if (extension && name) add(extensions, extension, stat.size)
  }
}

visit(application)
if (archived) {
  for (const entry of listPackage(profileArchive)) {
    const path = entry.replace(/^[/\\]/u, ''), metadata = statFile(profileArchive, path)
    if (metadata.size === undefined || metadata.unpacked) continue
    const parts = path.split(sep)
    if (parts[0] !== 'profiles' || parts[1] !== 'easywork' || parts[2] !== 'node_modules') continue
    const name = parts[3]?.startsWith('@') ? parts.slice(3, 5).join('/') : parts[3]
    if (name) add(packages, name, metadata.size)
  }
}
const ordered = map => Object.fromEntries([...map.entries()].sort((a, b) => b[1].bytes - a[1].bytes))
const report = {
  schemaVersion: 1,
  application,
  totals,
  groups: ordered(groups),
  largestProfilePackages: Object.fromEntries(Object.entries(ordered(packages)).slice(0, 25)),
  removableCandidateExtensions: ordered(extensions),
}
writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
console.log(`Package footprint: ${(totals.bytes / 1048576).toFixed(1)} MiB in ${totals.files} files; ${totals.links} links`)
for (const [name, value] of Object.entries(report.groups)) {
  console.log(`  ${name}: ${(value.bytes / 1048576).toFixed(1)} MiB, ${value.files} files`)
}
console.log(`Detailed report: ${output}`)
