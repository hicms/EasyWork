/** Exercise the published image admission code in the packaged Electron runtime, entirely in memory. */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const profile = resolve(process.argv[2])
const installation = createRequire(join(profile, 'package.json'))
const attachmentModule = installation.resolve('@deepseek-ai/dsh-attachment-local')
const { prepareImageFile } = await import(pathToFileURL(attachmentModule).href)
const sharp = createRequire(attachmentModule)('sharp')
const data = await sharp({ create: { width: 4, height: 2, channels: 3, background: '#2468ac' } }).png().toBuffer()
const limits = {
  maxImageBytes: 4096, maxImagesPerMessage: 1, maxMessageImageBytes: 4096,
  maxImagePixels: 16, maxImageDimension: 4, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'],
}
const policy = { maxPixels: 16, maxDimension: 2, maxBytes: 4096 }
const prepared = await prepareImageFile({ data, mediaType: 'image/png' }, limits, policy)
assert.equal(prepared.ref.width, 2)
assert.equal(prepared.ref.height, 1)
assert.deepEqual(prepared.ref.originalDimensions, { width: 4, height: 2 })
assert.equal(prepared.ref.bytes, prepared.data.byteLength)
const verified = await prepareImageFile({ data: prepared.data, mediaType: prepared.ref.mediaType }, limits, policy)
assert.equal(verified.ref.attachmentId, prepared.ref.attachmentId)
console.log('Packaged image decode, normalization and admission passed')
