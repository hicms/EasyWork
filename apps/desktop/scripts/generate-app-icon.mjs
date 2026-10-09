/** Rasterize the supplied EasyWork application tile without stretching it. */
import { resolve } from 'node:path'
import sharp from 'sharp'
import { BRAND_DIRECTORY } from '../../../scripts/generate-brand-assets.mjs'

await sharp(resolve(BRAND_DIRECTORY, 'EasyWork-app-icon.svg'))
  .resize({ width: 1024, height: 1024, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .ensureAlpha()
  .withIccProfile('srgb')
  .toColourspace('rgb16')
  .png({ compressionLevel: 9 })
  .toFile(resolve(import.meta.dirname, '../build/app-icon.png'))
