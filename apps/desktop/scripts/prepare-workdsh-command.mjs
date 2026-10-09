import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs'
import { cpSync } from 'node:fs'
import { prepareOfficialRelease } from './official-desktop-release.mjs'
import { resolve, join } from 'node:path'
const target = process.platform === 'win32' ? 'win-x64' : `mac-${process.env.WORKDSH_MAC_ARCH ?? process.arch}`
const released = await prepareOfficialRelease(resolve('.'), target)
const destination = resolve('build/workdsh-runtime/runtime/cli')
cpSync(join(released, 'runtime/cli'), destination, { recursive: true, force: true, dereference: false })
mkdirSync(join(destination, 'bin'), { recursive: true })
for (const name of ['command-cli']) copyFileSync(`lib/${name}.js`, join(destination, `${name}.js`))
writeFileSync(join(destination, 'bin/dsh'), `#!/bin/sh
set -e
launcher=$0
while [ -L "$launcher" ]; do
  directory=$(CDPATH= cd -- "$(dirname -- "$launcher")" && pwd -P)
  target=$(readlink "$launcher")
  case "$target" in /*) launcher=$target ;; *) launcher=$directory/$target ;; esac
done
runtime=$(CDPATH= cd -- "$(dirname -- "$launcher")/../../.." && pwd -P)
exec "$runtime/primary-runtime/dependencies/node/bin/node" "$runtime/runtime/cli/command-cli.js" "$@"
`, { mode: 0o755 })
writeFileSync(join(destination, 'bin/dsh.cmd'), '@echo off\r\n"%~dp0..\\..\\..\\primary-runtime\\dependencies\\node\\bin\\node.exe" "%~dp0..\\command-cli.js" %*\r\nexit /b %errorlevel%\r\n')
