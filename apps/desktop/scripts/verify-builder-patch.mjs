import fs from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { load } from 'js-yaml'

/** Signing must not use the stale node_modules tree left by a lockfile-only change. */
export function verifyLinkedBuilderPatch() {
  const root = resolve(import.meta.dirname, '../../..')
  const builder = dirname(createRequire(import.meta.url).resolve('app-builder-lib/package.json'))
  const lock = load(fs.readFileSync(join(root, 'yarn.lock'), 'utf8'))
  const key = Object.keys(lock).find(name => name.startsWith('app-builder-lib@patch:'))
  const hash = lock[key]?.resolution?.match(/&hash=([a-f\d]+)&/u)?.[1]
  const state = load(fs.readFileSync(join(root, 'node_modules/.yarn-state.yml'), 'utf8'))
  const linked = Object.keys(state).filter(name => name.startsWith('app-builder-lib@'))
  if (!hash || linked.length !== 1 || !linked[0].includes(`&hash=${hash}&`)) {
    throw new Error('Linked app-builder-lib patch differs from yarn.lock; synchronize dependencies explicitly before signing')
  }
  const uninstall = fs.readFileSync(join(builder, 'templates/nsis/include/installUtil.nsh'), 'utf8')
  const extract = fs.readFileSync(join(builder, 'templates/nsis/include/extractAppPackage.nsh'), 'utf8')
  if (!uninstall.includes('File /oname=$PLUGINSDIR\\old-uninstaller.exe "${UNINSTALLER_OUT_FILE}"')
    || !uninstall.includes('!ifdef EASYWORK_SAFE_INSTALL') || uninstall.includes('Old uninstaller returned code 2')
    || !/TryInPlace:[\s\S]*?!ifdef EASYWORK_SAFE_INSTALL\s+MessageBox[^\n]+\s+SetErrorLevel 2\s+Quit\s+!else/u.test(uninstall)
    || !/ClearErrors\s+File \/oname=[^\n]+\s+\$\{if\} \$\{Errors\}/u.test(uninstall)
    || !/OneMoreAttempt:\s+!ifdef EASYWORK_SAFE_INSTALL\s+ClearErrors\s+!endif\s+ExecWait/u.test(uninstall)
    || !extract.includes('nsExec::ExecToLog') || !extract.includes('SetErrorLevel 2')) {
    throw new Error('Linked NSIS templates do not contain the reviewed signed installer safeguards')
  }
}
