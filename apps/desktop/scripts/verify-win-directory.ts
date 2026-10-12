/** Verify the application directory used for Windows testing without an installer. */
import { verifyWindowsApplication } from './verify-win-installer.ts'

try {
  console.log(`Windows directory verification passed: ${verifyWindowsApplication()}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
