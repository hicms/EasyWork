/** Read packaged payloads as well as manifests; compression must not hide retired identifiers. */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

const retiredName = new RegExp(['work', 'dsh'].join('') + '|(?<!easy)work[ _-]dsh', 'i')
const headerText = bytes => bytes.toString('utf8').replace(/\0.*$/su, '')

export function assertCurrentProductNames(value, context) {
  if (retiredName.test(value)) throw new Error(`Retired product identifier in ${context}`)
}

/** Inspect npm's tar payload without extracting or executing it. */
export function verifyPackageArchive(filename) {
  const archive = gunzipSync(readFileSync(filename))
  let files = 0, packageName
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const name = [headerText(header.subarray(345, 500)), headerText(header.subarray(0, 100))].filter(Boolean).join('/')
    const size = Number.parseInt(headerText(header.subarray(124, 136)).trim(), 8)
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > archive.length) throw new Error('Invalid archive entry: ' + name)
    const payload = archive.subarray(offset + 512, offset + 512 + size)
    assertCurrentProductNames(name, filename + ':' + name)
    assertCurrentProductNames(headerText(header.subarray(157, 257)), filename + ':' + name + ' link')
    if (!payload.includes(0)) assertCurrentProductNames(payload.toString('utf8'), filename + ':' + name)
    if (name === 'package/package.json') packageName = JSON.parse(payload.toString('utf8')).name
    files++
    offset += 512 + Math.ceil(size / 512) * 512
  }
  if (typeof packageName !== 'string' || !packageName.startsWith('easywork-')) throw new Error('Missing EasyWork package manifest: ' + filename)
  return { packageName, files }
}

export function verifyProductArtifacts(directory) {
  const archives = []
  for (const filename of readdirSync(directory)) {
    assertCurrentProductNames(filename, directory)
    if (filename.endsWith('.tgz')) archives.push(verifyPackageArchive(join(directory, filename)))
    else if (/\.(?:json|mjs|md)$/.test(filename) || filename === 'SHA256SUMS') assertCurrentProductNames(readFileSync(join(directory, filename), 'utf8'), join(directory, filename))
  }
  if (!archives.length) throw new Error('No owned package archives to verify: ' + directory)
  return archives
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/verify-product-artifacts.mjs <package directory>')
  const packages = verifyProductArtifacts(resolve(process.argv[2]))
  console.log(`Verified names inside ${packages.length} package archives and their release metadata`)
}
