/**
 * Pure, fail-closed decision for one project-scoped, human editorial review.
 * No grant is minted here; only the server-side resolver may mint it.
 */
export type OperatorVerdict =
  | { ok: true; userId: string }
  | { ok: false; reason: string }

export type OwnedProjectsVerdict =
  | { ok: true; userId: string; allowedProjectIds: readonly string[] }
  | { ok: false }

export type ManualBedrockAuthorizationDecision =
  | { allowed: true }
  | { allowed: false; reason:
      'invalid_project' | 'operator_required' | 'project_access_unavailable'
      | 'identity_mismatch' | 'project_not_owned' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function decideManualBedrockAuthorization(
  projectId: unknown,
  operator: OperatorVerdict,
  access: OwnedProjectsVerdict,
): ManualBedrockAuthorizationDecision {
  if (typeof projectId !== 'string' || !UUID.test(projectId)) {
    return { allowed: false, reason: 'invalid_project' }
  }
  if (!operator.ok || !operator.userId) {
    return { allowed: false, reason: 'operator_required' }
  }
  if (!access.ok || !Array.isArray(access.allowedProjectIds)) {
    return { allowed: false, reason: 'project_access_unavailable' }
  }
  if (access.userId !== operator.userId) {
    return { allowed: false, reason: 'identity_mismatch' }
  }
  if (!access.allowedProjectIds.includes(projectId)) {
    return { allowed: false, reason: 'project_not_owned' }
  }
  return { allowed: true }
}
