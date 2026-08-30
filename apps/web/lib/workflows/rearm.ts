/**
 * lib/workflows/rearm.ts — approval makes a workflow eligible sooner. Nothing more.
 *
 * Granting a gate authorization used to leave `wake_at` wherever the scheduler
 * last pushed it, so an approved workflow could sit idle for a full visibility
 * timeout before anyone looked at it again. This pulls the next evaluation
 * forward by moving one timestamp.
 *
 * ── APPROVAL IS PERMISSION, NOT EXECUTION ───────────────────────────────────
 * This module cannot transition a workflow, cannot create a run and cannot
 * execute anything — it has no import that could. All it does is ask the
 * database to consider an instance sooner. The tick still re-derives the state,
 * re-checks the gate, re-checks evidence and re-validates the authorization, so
 * a re-armed workflow with a revoked grant simply does nothing on its next look.
 *
 * It is deliberately NOT a trigger on atlas_authorizations: a trigger would
 * couple the authority ledger to the scheduler and become precisely the hidden
 * execution path this design exists to avoid. The call is explicit, from the
 * route, after the grant has already been durably appended.
 *
 * Every real precondition lives in SQL (`public.workflow_rearm`): instance
 * active, project not paused, and a live grant for THIS instance's CURRENT
 * state. This file only resolves which instance an authorization refers to.
 */

import 'server-only'

import { WORKFLOW_GATE_TARGET_TYPE } from './gate'

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

export type RearmOutcome =
  /** wake_at pulled forward — the scheduler will look at this instance sooner. */
  | { rearmed: true }
  /** Not a workflow authorization at all; most authorizations are not. */
  | { rearmed: false; reason: 'not_a_workflow_gate' }
  /** The ledger row could not be read. Never fatal to the grant itself. */
  | { rearmed: false; reason: 'authorization_unreadable' }
  /** target_id was not the expected `instanceId:state` shape. */
  | { rearmed: false; reason: 'unparsable_target' }
  /**
   * SQL refused: instance closed, project paused, or no live grant for the
   * instance's current state. A refusal is a correct outcome, not an error —
   * the grant stands either way.
   */
  | { rearmed: false; reason: 'refused_by_preconditions' }
  | { rearmed: false; reason: 'rpc_failed' }

/** `target_id` is `${instanceId}:${state}` — see workflowGateTargetId. */
function instanceIdFromTargetId(targetId: string): string | null {
  const at = targetId.indexOf(':')
  if (at <= 0) return null
  const id = targetId.slice(0, at)
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null
}

/**
 * Re-arm the workflow an authorization belongs to, if it belongs to one.
 *
 * Best-effort by contract: the caller has already appended the grant, and a
 * failure here must never turn a successful authorization into an error. The
 * worst case of doing nothing is that the scheduler notices on its own schedule.
 */
export async function rearmForAuthorization(
  db: AnyDb, authorizationId: string,
): Promise<RearmOutcome> {
  let targetType: string | null = null
  let targetId: string | null = null
  try {
    // The newest event in the chain carries the current target.
    const { data, error } = await db
      .from('atlas_authorizations')
      .select('target_type, target_id')
      .eq('authorization_id', authorizationId)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return { rearmed: false, reason: 'authorization_unreadable' }
    targetType = data.target_type
    targetId = data.target_id
  } catch {
    return { rearmed: false, reason: 'authorization_unreadable' }
  }

  if (targetType !== WORKFLOW_GATE_TARGET_TYPE) {
    return { rearmed: false, reason: 'not_a_workflow_gate' }
  }
  const instanceId = targetId ? instanceIdFromTargetId(targetId) : null
  if (!instanceId) return { rearmed: false, reason: 'unparsable_target' }

  try {
    const { data, error } = await db.rpc('workflow_rearm', {
      p_instance_id: instanceId,
      p_authorization_id: authorizationId,
    })
    if (error) return { rearmed: false, reason: 'rpc_failed' }
    // The RPC returns the number of instances re-armed: 0 means it refused.
    return Number(data) > 0 ? { rearmed: true } : { rearmed: false, reason: 'refused_by_preconditions' }
  } catch {
    return { rearmed: false, reason: 'rpc_failed' }
  }
}
