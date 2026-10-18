/** Application menu details; versions come from the running carrier and its bundled Profile. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PRODUCT_NAME } from './startup-contract.ts'

export interface AboutInfo { version: string, runtime: string | undefined, electron: string, chromium: string, node: string, system: string }

export function aboutContent(language: string, info: AboutInfo) {
  const en = /^en(?:-|$)/iu.test(language)
  const unknown = en ? 'Unavailable' : '无法读取'
  const rows: Array<[string, string]> = en
    ? [['Version', info.version], ['DSH runtime', info.runtime ?? unknown], ['Electron', info.electron], ['Chromium', info.chromium], ['Node.js', info.node], ['System', info.system]]
    : [['版本', info.version], ['DSH 运行时', info.runtime ?? unknown], ['Electron', info.electron], ['Chromium', info.chromium], ['Node.js', info.node], ['系统', info.system]]
  return {
    title: en ? `About ${PRODUCT_NAME}` : `关于 ${PRODUCT_NAME}`,
    message: `${PRODUCT_NAME} ${info.version}`,
    detail: rows.map(([label, value]) => `${label}${en ? ': ' : '：'}${value}`).join('\n'),
    buttons: en ? ['OK', 'Copy details'] : ['确定', '复制信息'],
  }
}

export function bundledRuntimeVersion(profileDirectory: string): string | undefined {
  try {
    const { version } = JSON.parse(readFileSync(join(profileDirectory, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), 'utf8')) as { version?: unknown }
    return typeof version === 'string' ? version : undefined
  } catch { return undefined }
}
