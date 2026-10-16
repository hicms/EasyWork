import { homedir } from 'node:os'
import { isAbsolute, join, normalize } from 'node:path'

export const WORKSPACE_ROOT_ENV = 'EASYWORK_WORKSPACE_ROOT'
export const DOCUMENTS_DIRECTORY_ENV = 'EASYWORK_DOCUMENTS_DIRECTORY'
export const DEFAULT_WORKSPACE_DIRECTORY = 'default-workspace'

export interface WorkspaceRegistryDefaultInitializer {
  initializeDefault(resolveDirectory: () => Promise<string>): Promise<unknown>
}

export function resolveWorkspaceRoot(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment[WORKSPACE_ROOT_ENV]?.trim()
  if (configured) return validateAbsolutePath(configured, WORKSPACE_ROOT_ENV)
  const documents = environment[DOCUMENTS_DIRECTORY_ENV]?.trim() || join(homedir(), 'Documents')
  return join(validateAbsolutePath(documents, DOCUMENTS_DIRECTORY_ENV), 'EasyWork')
}

export function defaultWorkspacePath(root: string): string {
  return join(validateAbsolutePath(root, WORKSPACE_ROOT_ENV), DEFAULT_WORKSPACE_DIRECTORY)
}

export async function initializeEasyWorkDefaultWorkspace(
  registry: WorkspaceRegistryDefaultInitializer,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<unknown> {
  const path = defaultWorkspacePath(resolveWorkspaceRoot(environment))
  return registry.initializeDefault(async () => path)
}

function validateAbsolutePath(value: string, variable: string): string {
  if (!isAbsolute(value)) throw new Error(`${variable} must be an absolute path: ${value}`)
  return normalize(value)
}
