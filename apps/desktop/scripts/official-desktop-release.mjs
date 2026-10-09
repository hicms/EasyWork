/** Consume fixed official binary releases; never fetch a source checkout. */
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, renameSync, cpSync, writeFileSync } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
export const lock = JSON.parse(readFileSync(new URL('../../../upstream.json', import.meta.url), 'utf8'))
export async function verifyArtifact(path, artifact) {
  const digest = createHash('sha512'); let size = 0
  for await (const chunk of createReadStream(path)) { size += chunk.length; digest.update(chunk) }
  if (size !== artifact.size || digest.digest('base64') !== artifact.sha512) throw new Error('Official Desktop release size or SHA-512 mismatch')
}
function findResources(directory, depth = 0) {
  if (existsSync(join(directory, 'runtime/primary-runtime/runtime.json'))) return directory
  if (depth > 8) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const found = findResources(join(directory, entry.name), depth + 1)
    if (found) return found
  }
}
function nestedArchive(directory, depth = 0) {
  if (depth > 5) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isFile() && /^app-.*\.7z$/.test(entry.name)) return path
    if (entry.isDirectory()) { const found = nestedArchive(path, depth + 1); if (found) return found }
  }
}
export async function prepareOfficialRelease(desktopRoot, target) {
  const artifact = lock.desktopArtifacts?.[target]
  if (!artifact || lock.distribution !== 'published-packages-and-desktop-release') throw new Error('Official release target is not locked: ' + target)
  const cache = join(desktopRoot, 'build/official-release-cache'); mkdirSync(cache, { recursive: true })
  const destination = join(cache, target + '-' + lock.version)
  const receipt = join(destination, 'receipt.json')
  const identity = JSON.stringify({ version: lock.version, target, artifact })
  if (existsSync(receipt) && readFileSync(receipt, 'utf8') === identity && existsSync(join(destination, 'runtime/primary-runtime/runtime.json'))) return destination
  const archive = process.env.WORKDSH_OFFICIAL_DESKTOP_ARCHIVE ? resolve(process.env.WORKDSH_OFFICIAL_DESKTOP_ARCHIVE) : join(cache, new URL(artifact.url).pathname.split('/').at(-1))
  if (!existsSync(archive)) {
    const partial = archive + '.partial'
    const response = await fetch(artifact.url, { signal: AbortSignal.timeout(600_000) })
    if (!response.ok || !response.body) throw new Error('Official Desktop download failed: ' + response.status)
    try { await pipeline(Readable.fromWeb(response.body), createWriteStream(partial)); await verifyArtifact(partial, artifact); renameSync(partial, archive) }
    finally { rmSync(partial, { force: true }) }
  }
  await verifyArtifact(archive, artifact)
  const temporary = mkdtempSync(join(cache, 'extract-'))
  try {
    if (target.startsWith('mac-')) execFileSync('/usr/bin/ditto', ['-x', '-k', archive, temporary], { stdio: 'inherit' })
    else {
      const sevenZip = process.env.WORKDSH_7ZIP ?? join(process.env.ProgramFiles ?? 'C:\\Program Files', '7-Zip/7z.exe')
      execFileSync(sevenZip, ['x', '-y', archive, '-o' + temporary], { stdio: 'inherit' })
      const inner = nestedArchive(temporary)
      if (inner) execFileSync(sevenZip, ['x', '-y', inner, '-o' + join(temporary, 'application')], { stdio: 'inherit' })
    }
    const resources = findResources(temporary)
    if (!resources) throw new Error('Official release has no reusable runtime resources')
    const metadata = JSON.parse(readFileSync(join(resources, 'runtime/primary-runtime/runtime.json'), 'utf8'))
    const [platform, arch] = target.split('-')
    if (metadata.desktopVersion !== lock.version || metadata.platform !== (platform === 'mac' ? 'darwin' : 'win32') || metadata.arch !== arch || metadata.pnpm !== '11.7.0') throw new Error('Official release runtime version/platform mismatch')
    if (!existsSync(join(resources, 'runtime/cli/command-manager.js')) || !existsSync(join(resources, 'runtime/office-skills'))) throw new Error('Official release is missing command/Office resources')
    rmSync(destination, { recursive: true, force: true }); mkdirSync(destination)
    for (const name of ['primary-runtime', 'office-skills', 'cli']) cpSync(join(resources, 'runtime', name), join(destination, 'runtime', name), { recursive: true, dereference: false })
    writeFileSync(receipt, identity)
    return destination
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}
