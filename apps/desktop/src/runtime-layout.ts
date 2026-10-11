/** One installation: loose files for preparation, an ASAR Profile in packaged Desktop. */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function runtimeProfileDirectory(runtime: string): string {
  const directory = join(runtime, 'profiles', 'easywork')
  const archive = join(runtime, '..', 'app.asar')
  if (!existsSync(archive)) return directory
  if (existsSync(directory)) throw new Error('Desktop contains both archived and loose runtime Profiles')
  return join(archive, 'profiles', 'easywork')
}

export const archivedRuntimeProfile = (profile: string): boolean => profile.split(/[/\\]/u).some(part => part.endsWith('.asar'))

/** The installed command starts the same ASAR-capable Electron runtime as the GUI. */
export function packagedHostExecutable(runtime: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'darwin' ? join(runtime, '..', '..', 'MacOS', 'EasyWork')
    : join(runtime, '..', '..', platform === 'win32' ? 'EasyWork.exe' : 'EasyWork')
}
