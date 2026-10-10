/** Generate native tray bitmaps from the repository-owned brand SVG. */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { BRAND_DIRECTORY, readBrandPalette } from '../../../scripts/generate-brand-assets.mjs'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const buildRoot = join(packageRoot, 'build')
const sourcePath = join(buildRoot, 'tray-icon.svg')
const source = await readFile(sourcePath, 'utf8')
const tile = await readFile(join(BRAND_DIRECTORY, 'EasyWork-app-icon.svg'), 'utf8')

const { Teal: BRAND_TEAL } = await readBrandPalette()
if (!source.includes(`fill="${BRAND_TEAL}"`) || /<style\b/iu.test(source)) {
  throw new Error(`generate-tray-icons: tray-icon.svg must use the canonical brand color ${BRAND_TEAL}`)
}
if (!tile.includes(`fill="${BRAND_TEAL}"`) || /<style\b/iu.test(tile)) {
  throw new Error(`generate-tray-icons: application SVG must use the canonical brand color ${BRAND_TEAL}`)
}

const variants = [
  ['tray-iconTemplate.png', source.replaceAll(BRAND_TEAL, '#000000'), 16],
  ['tray-iconTemplate@2x.png', source.replaceAll(BRAND_TEAL, '#000000'), 32],
  // The square app tile fills Windows/Linux tray slots at every supported DPI.
  // Retain the internal filenames consumed by existing tray/packaging code.
  ['tray-icon-blue.png', tile, 16],
  ['tray-icon-blue@1.25x.png', tile, 20],
  ['tray-icon-blue@1.5x.png', tile, 24],
  ['tray-icon-blue@2x.png', tile, 32],
]

await Promise.all(variants.map(async ([filename, artwork, size]) => {
  await sharp(Buffer.from(artwork))
    .resize({ width: size, height: size, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(join(buildRoot, filename))
}))
