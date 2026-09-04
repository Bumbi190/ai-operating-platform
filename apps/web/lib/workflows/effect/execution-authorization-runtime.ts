/**
 * lib/workflows/effect/execution-authorization-runtime.ts — the runtime consumer
 * the `workflow_execution` target never had.
 *
 * Phase 2B-1 built the target and proved it forward-only; nothing then read it.
 * `assertWorkflowActionReady` validated whatever authorization the run carried
 * through `readWorkflowAuthorization`, which resolves a `workflow_gate` target —
 * so an execution grant was invisible, and a gate grant was the only thing that
 * could satisfy an effectful action's authorization requirement. That is the
 * category error this closes: permission to LEAVE a state is not permission to
 * spend money inside it.
 *
 * ── THE GATE RESOLVER IS NOT REUSED, AND NOT TOUCHED ────────────────────────
 * Four `workflow.gate.advance` grants exist and one has been consumed. This
 * module shares only the ledger primitive `isAuthorizationEffective`, calling it
 * with a different target and a different action kind. Nothing about how a gate
 * authorization is computed, read or matched changes.
 *
 * `isEffectiveNow` compares targetType, targetId AND versionHash, so the
 * separation is enforced by the ledger rather than by this file remembering to
 * check: a gate grant cannot satisfy an execution query, a story-approval grant
 * cannot either, and input drift moves the version hash and invalidates the
 * grant on its own.
 */

import { isAuthorizationEffective } from '@/lib/atlas/authorization/principal-read'
import type { ActionClass } from '../action-target'
import {
  computeExecutionAuthorizationTarget, WORKFLOW_EXECUTION_ACTION_KIND,
  type ExecutionAuthorizationInput,
} from './execution-authorization'

export type ExecutionAuthorizationRefusal =
  | 'missing'
  | 'not_effective'
  | 'malformed'

export interface ExecutionAuthorizationVerdict {
  readonly valid: boolean
  readonly refusal: ExecutionAuthorizationRefusal | null
  readonly reason: string
  /** The target the grant had to match, for auditing a refusal. */
  readonly targetVersionHash: string | null
}

export interface ExecutionAuthorizationQuery extends ExecutionAuthorizationInput {
  readonly projectId: string
  readonly authorizationId: string | null | undefined
  readonly actionClass: ActionClass
}

/**
 * Is there a live grant permitting THIS action, on THIS input, in THIS attempt?
 *
 * An absent id is a refusal rather than a pass: a class whose policy requires
 * authorization and whose run carries none should not exist, and treating the
 * absence as permission is precisely the failure mode worth refusing loudly.
 */
export async function assertExecutionAuthorized(
  query: ExecutionAuthorizationQuery,
): Promise<ExecutionAuthorizationVerdict> {
  if (!query.authorizationId) {
    return {
      valid: false, refusal: 'missing', targetVersionHash: null,
      reason: 'the run carries no execution authorization',
    }
  }

  const target = computeExecutionAuthorizationTarget(query)

  const effectiveness = await isAuthorizationEffective(query.authorizationId, {
    target,
    projectId: query.projectId,
    // A DIFFERENT purpose from workflow.gate.advance. The ledger refuses a grant
    // whose action kind does not match, so an advance grant cannot act here even
    // if someone passed its id.
    actionKind: WORKFLOW_EXECUTION_ACTION_KIND,
  })

  if (effectiveness.status !== 'ok') {
    return {
      valid: false, refusal: 'malformed', targetVersionHash: target.versionHash,
      reason: `authorization chain unreadable: ${effectiveness.status}`,
    }
  }
  if (!effectiveness.effective) {
    return {
      valid: false, refusal: 'not_effective', targetVersionHash: target.versionHash,
      reason: `execution authorization is not effective: ${effectiveness.reason}`,
    }
  }
  return {
    valid: true, refusal: null, targetVersionHash: target.versionHash,
    reason: 'effective',
  }
}
