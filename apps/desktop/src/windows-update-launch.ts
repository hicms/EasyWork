import childProcess from 'node:child_process'
import { win32 } from 'node:path'

export function windowsInstallerCommand(installer: string, directory: string, language: string) {
  if (!win32.isAbsolute(installer) || !win32.isAbsolute(directory) || /["\r\n]/u.test(installer + directory)) {
    throw new Error('Invalid Windows installer or installation directory')
  }
  return {
    // NSIS consumes the entire unquoted remainder after its final /D= argument.
    args: ['/S', '--updated', '--force-run', `/D=${directory}`],
    options: {
      argv0: `"${installer}"`, windowsVerbatimArguments: true, windowsHide: true,
      detached: true, stdio: 'ignore' as const,
      env: { ...process.env, EASYWORK_UPDATE_INSTALL_DIRECTORY: directory,
        // release-installer.nsh localizes its silent-update progress window with this value.
        EASYWORK_UPDATE_LANGUAGE: /^en(?:-|$)/iu.test(language) ? 'en' : 'zh' },
    },
  }
}

/** A PID alone is not launch confirmation. Never fall back to shell.openPath. */
export async function launchWindowsInstaller(installer: string, directory: string, language: string): Promise<void> {
  const { args, options } = windowsInstallerCommand(installer, directory, language)
  await new Promise<void>((resolve, reject) => {
    const child = childProcess.spawn(installer, args, options)
    child.once('error', reject)
    child.once('spawn', () => { child.unref(); resolve() })
  })
}
