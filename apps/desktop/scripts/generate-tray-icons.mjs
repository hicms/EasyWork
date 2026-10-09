/** Generate native tray bitmaps from the repository-owned brand SVG. */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { readBrandPalette } from '../../../scripts/generate-brand-assets.mjs'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const buildRoot = join(packageRoot, 'build')
const sourcePath = join(buildRoot, 'tray-icon.svg')
const source = await readFile(sourcePath, 'utf8')

const { Teal: BRAND_TEAL } = await readBrandPalette()
if (!source.includes(`fill="${BRAND_TEAL}"`) || /<style\b/iu.test(source)) {
  throw new Error(`generate-tray-icons: tray-icon.svg must use the canonical brand color ${BRAND_TEAL}`)
}

const variants = [
  ['tray-iconTemplate.png', '#000000', 16],
  ['tray-iconTemplate@2x.png', '#000000', 32],
  // Retain the internal filenames consumed by existing tray/packaging code.
  ['tray-icon-blue.png', BRAND_TEAL, 16],
  ['tray-icon-blue@1.25x.png', BRAND_TEAL, 20],
  ['tray-icon-blue@1.5x.png', BRAND_TEAL, 24],
  ['tray-icon-blue@2x.png', BRAND_TEAL, 32],
]

await Promise.all(variants.map(async ([filename, color, size]) => {
  const rendered = source.replaceAll(BRAND_TEAL, color)
  await sharp(Buffer.from(rendered))
    .resize({ width: size, height: size, fit: 'contain' })
    .png({ compressionLevel: 9 })
    .toFile(join(buildRoot, filename))
}))
