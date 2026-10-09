/** Native menu adapter; official workers own all command installation mutations. */
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app, dialog } from 'electron'
interface State { fingerprint: string; managed: boolean; available: boolean; destination?: string; directory?: string; activeCommand?: string; kind?: string }
let operation: Promise<void> | undefined
export function manageCommand(resources: string, scope: string): Promise<void> {
  return operation ??= show(resources, scope).finally(() => { operation = undefined })
}
async function worker(resources: string, action: string, expected?: string, elevated = false): Promise<State> {
  const node = join(resources, 'primary-runtime/dependencies/node/bin', process.platform === 'win32' ? 'node.exe' : 'node')
  const entry = join(resources, 'runtime/cli/command-manager.js')
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD|^NODE_OPTIONS$|^NODE_PATH$/iu.test(name)))
  const options = { timeout: 30000, maxBuffer: 65536, windowsHide: true, env }
  let stdout: string
  if (elevated) {
    const script = 'on run argv\nset cmd to "/usr/bin/env -i " & quoted form of (item 1 of argv) & " " & quoted form of (item 2 of argv) & " " & quoted form of (item 3 of argv) & " " & quoted form of (item 4 of argv)\ndo shell script cmd with administrator privileges\nend run'
    stdout = (await promisify(execFile)('/usr/bin/osascript', ['-e', script, node, entry, action, expected ?? ''], options)).stdout
  } else {
    try { stdout = (await promisify(execFile)(node, [entry, action, ...expected ? [expected] : []], options)).stdout }
    catch (error) { const result = error as { stdout?: string }; if (!result.stdout) throw error; stdout = result.stdout }
  }
  const result = JSON.parse(stdout) as { ok: boolean; code?: string; message?: string; state?: State }
  if (!result.ok) {
    if (!elevated && process.platform === 'darwin' && action !== 'inspect' && ['EACCES', 'EPERM'].includes(result.code ?? '')) return worker(resources, action, expected, true)
    throw new Error(result.message ?? '命令管理失败')
  }
  if (!result.state || !/^[a-f0-9]{64}$/.test(result.state.fingerprint)) throw new Error('命令管理返回无效状态')
  return result.state
}
async function show(resources: string, scope: string): Promise<void> {
  try {
    if (!app.isPackaged) { await dialog.showMessageBox({ message: '请安装正式 Desktop 包后管理 dsh 命令', buttons: ['关闭'] }); return }
    const state = await worker(resources, 'inspect')
    const location = state.destination ?? join(state.directory ?? '', 'dsh.cmd')
    const choice = await dialog.showMessageBox({ title: '终端命令 dsh', message: state.managed ? (state.available ? '终端命令 dsh 已安装' : '终端命令 dsh 需要修复') : '在终端中使用 EasyWork（可选）', detail: `安装后，可在系统终端输入 dsh，运行官方命令或管理插件。桌面聊天无需安装此命令。\n\n这只创建终端命令入口，不会重新下载 DSH、Node 或 pnpm。\n命令位置：${location}\n当前插件管理空间：${scope}\n移除命令不会卸载桌面应用或删除工作区。`, buttons: state.managed ? ['关闭', '修复命令', '移除命令'] : ['安装终端命令', '暂不安装'], cancelId: state.managed ? 0 : 1 })
    const action = state.managed ? choice.response === 1 ? 'install' : choice.response === 2 ? 'remove' : undefined : choice.response === 0 ? 'install' : undefined
    if (!action) return
    if (action === 'install' && (state.activeCommand || (state.kind && state.kind !== 'missing' && !state.managed))) {
      const confirm = await dialog.showMessageBox({ type: 'warning', message: '确认切换 dsh 命令到 EasyWork？', detail: '已有命令会由官方安装逻辑保留；移除时恢复未被修改的原命令。其他安装与 shell 启动文件保持原样。', buttons: ['取消', '继续'], defaultId: 0, cancelId: 0 })
      if (confirm.response !== 1) return
    }
    await worker(resources, action, state.fingerprint)
    await dialog.showMessageBox({ message: action === 'remove' ? 'EasyWork 命令已移除' : 'EasyWork 命令已安装，请打开新终端使用', buttons: ['关闭'] })
  } catch (error) { dialog.showErrorBox('无法管理 dsh 命令', error instanceof Error ? error.message : '请重试') }
}
