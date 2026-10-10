import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write';
import type { CenterConfig } from './contracts.js';

export const stateFile = '.easywork-plugin-updates.json';
export interface InstalledUpdate {
  from: string; version: string; integrity: string; source: 'center' | 'registry'; sourceSpec?: string; process: string; installedAt: number;
}
export interface UpdateState { center?: CenterConfig; installed: Record<string, InstalledUpdate> }
export async function readState(dir: string): Promise<UpdateState> {
  try {
    const state = JSON.parse(await readFile(join(dir, stateFile), 'utf8'));
    if (!state || typeof state.installed !== 'object' || state.installed === null) throw new Error('Invalid update state');
    return state;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { installed: {} };
    throw error;
  }
}
export async function saveState(dir: string, state: UpdateState): Promise<void> {
  await writeFileAtomic(join(dir, stateFile), JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}
