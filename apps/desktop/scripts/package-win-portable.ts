/** Build an unsigned Windows x64 single-file portable executable on Windows. */

import { fileURLToPath } from 'node:url'
import {
  createWindowsPackageOptions,
  packageWindowsArtifact,
} from './package-win.ts'

const invokedPath = process.argv[1]
if (invokedPath !== undefined && invokedPath === fileURLToPath(import.meta.url)) {
  try {
    packageWindowsArtifact(
      createWindowsPackageOptions('./verify-win-portable.ts'),
      'portable',
      'portable executable',
    )
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
