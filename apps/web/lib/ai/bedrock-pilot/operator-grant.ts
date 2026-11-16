/**
 * Non-forgeable authority for *manual* Bedrock editorial QA.
 *
 * A route must never accept this object from JSON. Only the verified Supabase
 * session + configured platform operator + RLS-mirrored project ownership may
 * mint one. This module has NO provider or budget dispatch.
 */
import 'server-only'
import { resolvePlatformOperator } from '@/lib/auth/platform-operator'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { decideManualBedrockAuthorization } from './operator-decision'

const minted = new WeakMap<object, string>()

export type ManualBedrockOperatorGrant = Readonly<{
  kind: 'MANUAL_BEDROCK_OPERATOR_GRANT'
  projectId: string
  actor: string
}>

export type ManualBedrockGrantResult =
  | { ok: true; grant: ManualBedrockOperatorGrant }
  | { ok: false; reason: string }

/**
 * No caller-supplied email, project permissions, or operatorApproved boolean.
 * Resolves the session at invocation time; fail closed on auth/DB exceptions.
 */
export async function resolveManualBedrockOperatorGrant(
  projectId: string,
): Promise<ManualBedrockGrantResult> {
  try {
    const operator = await resolvePlatformOperator()
    if (!operator.ok) return { ok: false, reason: 'operator_required' }
    const access = await resolveProjectAccess()
    const decision = decideManualBedrockAuthorization(
      projectId,
      operator,
      access.ok
        ? { ok: true, userId: access.userId, allowedProjectIds: access.allowedProjectIds }
        : { ok: false },
    )
    if (!decision.allowed) return { ok: false, reason: decision.reason }

    const grant: ManualBedrockOperatorGrant = Object.freeze({
      kind: 'MANUAL_BEDROCK_OPERATOR_GRANT' as const,
      projectId,
      actor: operator.actor,
    })
    minted.set(grant, projectId)
    return { ok: true, grant }
  } catch {
    // An unreadable session or project ownership is never authorization.
    return { ok: false, reason: 'authority_unavailable' }
  }
}

/** A structurally identical object or JSON copy is NOT a valid grant. */
export function isManualBedrockOperatorGrant(
  value: unknown, projectId: string,
): value is ManualBedrockOperatorGrant {
  return typeof value === 'object' && value !== null
    && minted.get(value) === projectId
}

export function assertManualBedrockOperatorGrant(
  value: unknown, projectId: string,
): asserts value is ManualBedrockOperatorGrant {
  if (!isManualBedrockOperatorGrant(value, projectId)) {
    throw new Error('BEDROCK_PILOT_OPERATOR_GRANT_REQUIRED')
  }
}
