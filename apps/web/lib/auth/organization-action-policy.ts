/**
 * Organization authority is independent of project visibility.
 * Approval represents a decision, never an instruction to execute.
 */
import type { OrganizationRoleState } from './organization-role'
export type OrganizationAction = 'read' | 'propose' | 'approve' | 'execute' | 'invite' | 'deploy' | 'billing' | 'credentials'
export type AuthorizationDecision = { allowed: boolean; reason: string }
export function authorizeOrganizationAction(
  state: OrganizationRoleState,
  action: OrganizationAction,
  proposalAuthorId?: string,
  actorId?: string,
): AuthorizationDecision {
  if (!state.active) return { allowed: false, reason: 'inactive_membership' }
  if (action === 'read') return { allowed: true, reason: 'member_read' }
  if (action === 'propose') return { allowed: true, reason: 'proposal_only' }
  if (state.role !== 'owner') return { allowed: false, reason: 'owner_required' }
  if (action === 'approve') {
    if (!proposalAuthorId || !actorId || proposalAuthorId === actorId)
      return { allowed: false, reason: 'separation_of_duties' }
    return { allowed: true, reason: 'owner_approval_only' }
  }
  // Owners continue to use their existing per-action server authorization;
  // this predicate is never sufficient to execute or deploy anything.
  return { allowed: false, reason: 'requires_existing_privileged_gate' }
}
