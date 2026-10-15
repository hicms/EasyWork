import type { ExpertManagementClient } from './management.js';

/** A preset label alone is not proof that the user summoned an expert. */
export async function resolveExpertSeat(
  management: Pick<ExpertManagementClient, 'verifyBinding' | 'get'>,
  sessionId: string | undefined,
  preset: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  if (!sessionId) return undefined;
  let binding;
  try {
    binding = await management.verifyBinding(sessionId, signal);
  } catch (error) {
    const failure = error as { code?: string; details?: { reason?: string } } | null;
    if (failure?.code === 'experts/not-found' && failure.details?.reason === 'unbound') return undefined;
    throw error;
  }
  signal.throwIfAborted();
  if (binding.presetRevisionRef !== preset) throw new Error('当前会话的专家配置与绑定不一致，请从专家中心重新召唤。');
  const detail = await management.get(binding.expertRevisionRef.expertId, binding.expertRevisionRef.revisionId, signal);
  signal.throwIfAborted();
  return detail.revision?.definition.name ?? '已召唤专家';
}
