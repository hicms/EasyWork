import { copyFile, readFile, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { hashFile, verifyUpdateArtifacts } from './verify-update-artifacts.mjs'

const dist = resolve(import.meta.dirname, '../dist')
const output = join(dist, 'release')
const release = JSON.parse(await readFile(join(output, 'release.json'), 'utf8'))
const verified = await verifyUpdateArtifacts(dist, release.version)
if (verified.installerSha512 !== release.installerSha512) throw new Error('Installer changed after signing verification')
const ui = JSON.parse(await readFile(join(output, 'ui-acceptance.json'), 'utf8'))
if (ui.ok !== true || ui.userDataIsolated !== true) throw new Error('Actual unpacked UI acceptance did not pass')
for (const asset of verified.assets) await copyFile(join(dist, asset.name), join(output, asset.name))
release.assets = [...verified.assets]
for (const name of ['ui-acceptance.json', 'personal.png']) release.assets.push({ name, size: (await stat(join(output, name))).size, sha256: await hashFile(join(output, name), 'sha256', 'hex') })
await writeFile(join(output, 'release.json'), JSON.stringify(release, null, 2) + '\n')
