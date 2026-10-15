/** Preserve licenses when runtime JavaScript is bundled without node_modules. */
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function collectUpdaterLicenses() {
  const visited = new Set(), notices = []
  function visit(manifestPath) {
    if (visited.has(manifestPath)) return
    visited.add(manifestPath)
    const directory = dirname(manifestPath), manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const licenses = readdirSync(directory).filter(name => /^licen[cs]e(?:[.-].*)?$/iu.test(name))
    let text = licenses.map(name => readFileSync(join(directory, name), 'utf8')).join('\n')
    // This exact published package declares MIT but ships no license file.
    if (!text && manifest.name === 'lazy-val' && manifest.version === '1.0.5' && manifest.license === 'MIT' && manifest.author === 'Vladimir Krivosheev') {
      text = readFileSync(new URL('../licenses/lazy-val-1.0.5.txt', import.meta.url), 'utf8')
    }
    if (!text) throw new Error('Missing bundled dependency license: ' + manifest.name)
    notices.push(`${manifest.name}@${manifest.version} (${manifest.license})\n\n` + text)
    const require = createRequire(manifestPath)
    for (const dependency of Object.keys(manifest.dependencies ?? {})) visit(require.resolve(`${dependency}/package.json`))
  }
  visit(createRequire(import.meta.url).resolve('electron-updater/package.json'))
  return notices.sort().join('\n\n' + '='.repeat(72) + '\n\n') + '\n'
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = resolve(import.meta.dirname, '../lib')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'desktop-updater-LICENSES.txt'), collectUpdaterLicenses())
}
