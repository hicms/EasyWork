import { randomUUID } from 'node:crypto';
import type { ActorContext, IdentityProfile, IdentityResolutionContext, IdentityService, Membership } from 'workdsh-contracts';
import type { VerifiedMember } from './request-context.js';

/** Internal Agent-owned identity. The trusted verifier retains authentication, not this DTO. */
export class EnterpriseMemberIdentity implements IdentityService {
  readonly id = 'workdsh-enterprise-member';
  private revoked = false;
  private readonly revision = randomUUID();
  private constructor(private readonly member: VerifiedMember,
    private readonly verify: (signal?: AbortSignal) => Promise<VerifiedMember>) {}

  static async admit(verify: (signal?: AbortSignal) => Promise<VerifiedMember>, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const member = await verify(signal);
    signal?.throwIfAborted();
    if (!member.active || !member.organizationId || !member.principalId || !member.role) throw new Error('Enterprise authentication required');
    return new EnterpriseMemberIdentity(Object.freeze({ ...member }), verify);
  }
  revoke(): void { this.revoked = true; }
  private check(): void { if (this.revoked) throw new Error('Enterprise member identity expired'); }
  profile(): IdentityProfile {
    this.check();
    const membership: Membership = Object.freeze({ organizationId: this.member.organizationId,
      principalId: this.member.principalId, principalKind: 'human', role: this.member.role!, state: 'active', revision: this.revision });
    return Object.freeze({ principalId: this.member.principalId, principalKind: 'human', resolvedBy: this.id,
      organization: Object.freeze({ id: this.member.organizationId, kind: 'team', name: '企业空间', revision: this.revision }), membership });
  }
  membership(organizationId: string, principalId: string): Membership | undefined {
    const profile = this.profile();
    return organizationId === this.member.organizationId && principalId === this.member.principalId ? profile.membership : undefined;
  }
  async resolve(evidence?: IdentityResolutionContext, signal?: AbortSignal): Promise<ActorContext> {
    this.check(); signal?.throwIfAborted();
    let current: VerifiedMember;
    try { current = await this.verify(signal); }
    catch (error) { if (!signal?.aborted) this.revoke(); throw error; }
    signal?.throwIfAborted(); this.check();
    if (!current.active || current.principalId !== this.member.principalId ||
        current.organizationId !== this.member.organizationId || current.role !== this.member.role) {
      this.revoke(); throw new Error('Enterprise member identity changed or expired');
    }
    return Object.freeze({ principalId: this.member.principalId, organizationId: this.member.organizationId,
      resolvedBy: this.id, requestId: randomUUID(),
      ...(evidence?.sessionId === undefined ? {} : { sessionId: evidence.sessionId }),
      ...(evidence?.runId === undefined ? {} : { runId: evidence.runId }) });
  }
}
