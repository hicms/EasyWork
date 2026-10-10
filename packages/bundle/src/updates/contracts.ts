export const updatePath = '/api/easywork-plugin-updates';
export const ownedPlugins = ['easywork-plugin-connectors', 'easywork-plugin-experts', 'easywork-plugin-library', 'easywork-plugin-projects', 'easywork-plugin-skills'] as const;
export type UpdateStatus = 'unchecked' | 'latest' | 'available' | 'incompatible' | 'check-failed' | 'no-source' | 'updating' | 'restart-required' | 'updated' | 'update-failed' | 'cancelled';
export interface CenterConfig { url: string; publicKey: string }
export interface UpdateRow {
  name: string; title: string; currentVersion: string; runningVersion?: string;
  source: string; availableVersion?: string; compatibility: string; status: UpdateStatus;
  message?: string; notes?: string; candidateId?: string; enabled: boolean;
}
export interface UpdateView { rows: UpdateRow[]; busy: boolean; center?: CenterConfig }
export interface Release {
  name: string; version: string; archive: string; integrity: string; size?: number; notes?: string;
  manifest: Record<string, any>;
}
export interface Candidate extends Release {
  id: string; from: string; expires: number; source: 'center' | 'registry'; sourceSpec?: string; sourceFingerprint?: string;
}
