/** Validate final signed installer bytes; never rewrite an already signed installer. */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, readdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load } from 'js-yaml'
import { buildBlockMap } from 'app-builder-lib/out/targets/blockmap/blockmap.js'
import { updateChannel } from '../src/update-policy.ts'

export async function hashFile(path, algorithm = 'sha512', encoding = 'base64') {
  const hash = createHash(algorithm)
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return hash.digest(encoding)
}

/** UI evidence belongs to the version and ASAR that were actually exercised. */
export async function verifyUiAcceptance(directory, version, asarPath) {
  const ui = JSON.parse(await readFile(join(directory, 'ui-acceptance.json'), 'utf8'))
  if (ui.ok !== true || ui.userDataIsolated !== true || ui.version !== version
    || ui.asarSha512 !== await hashFile(asarPath)) throw new Error('UI acceptance does not match the current packaged application')
  return ui
}

export async function verifyUpdateArtifacts(directory, version) {
  const channel = updateChannel(version)
  const installer = `EasyWork-${version}-x64-Setup.exe`
  const blockmap = `${installer}.blockmap`
  const metadata = `${channel}.yml`
  const manifest = load(await readFile(join(directory, metadata), 'utf8'))
  const installerPath = join(directory, installer)
  const size = (await stat(installerPath)).size
  const sha512 = await hashFile(installerPath)
  if (manifest.version !== version || manifest.path !== installer || manifest.sha512 !== sha512
    || manifest.files?.length !== 1 || manifest.files[0].url !== installer
    || manifest.files[0].sha512 !== sha512 || manifest.files[0].size !== size || manifest.packages) {
    throw new Error('Update manifest does not describe the final installer bytes')
  }
  const names = await readdir(directory)
  if (names.some(name => /^(?:latest|alpha|beta)\.yml$/u.test(name) && name !== metadata)) throw new Error('Mixed channel metadata in release output')
  const scratch = await mkdtemp(join(tmpdir(), 'easywork-blockmap-'))
  try {
    const expected = join(scratch, 'expected.blockmap')
    // Streaming recomputation reads final bytes; only a small disposable map is written.
    await buildBlockMap(installerPath, 'gzip', expected)
    if (!(await readFile(expected)).equals(await readFile(join(directory, blockmap)))) throw new Error('Blockmap does not match the final installer')
  } finally {
    await rm(scratch, { recursive: true, force: true }) // unique task-owned temporary directory
  }
  return { installerSha512: sha512, assets: await Promise.all([installer, blockmap, metadata].map(async name => ({
    name, size: (await stat(join(directory, name))).size, sha256: await hashFile(join(directory, name), 'sha256', 'hex'),
  }))) }
}
