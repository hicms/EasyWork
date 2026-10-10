/** Product source and paths use one name, without legacy aliases or exceptions. */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const oldName = new RegExp(['work', 'dsh'].join('') + '|(?<!easy)work[ _-]dsh', 'ig')
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))]
const failures = []
let checked = 0
for (const file of files) {
  const path = resolve(root, file)
  if (!existsSync(path)) continue
  checked++
  oldName.lastIndex = 0
  if (oldName.test(file)) failures.push(`Retired product name in path: ${file}`)
  const bytes = readFileSync(path)
  if (bytes.includes(0)) continue
  const text = bytes.toString('utf8')
  oldName.lastIndex = 0
  if (oldName.test(text)) failures.push(`Retired product name in source: ${file}`)
}
if (failures.length) throw new Error(failures.join('\n'))
console.log(`Verified product names across ${checked} source paths; no retired names or exceptions`)
