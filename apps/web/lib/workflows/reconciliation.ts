/**
 * lib/workflows/reconciliation.ts — asking the authoritative system what really
 * happened, and being the ONLY thing allowed to resolve an ambiguity.
 *
 * A reconciliation is READ-ONLY by construction. It asks one question — "was
 * action X actually applied?" — and records the answer. It never repairs, never
 * retries and never deletes: an automatic destructive repair of a state we do not
 * understand is strictly worse than a frozen workflow and a paged human.
 *
 * The payoff of having built PR4–PR8 before any executor is that the observers
 * this needs already exist. `checkConsumersInSync`, `verifyDeploymentChain` and
 * the protected-access probes are exactly "ask the authority what is true", which
 * is what a reconciliation is.
 */

import 'server-only'

import type { ActionOutcome } from './action-outcome'

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

export const RECONCILIATION_RESULTS = [
  'CONFIRMED_SUCCEEDED',
  'CONFIRMED_NOT_APPLIED',
  'CONFIRMED_PARTIAL',
  /** The authority could not tell us. The incident stays frozen. */
  'STILL_UNKNOWN',
] as const
export type ReconciliationResult = (typeof RECONCILIATION_RESULTS)[number]

export interface ReconciliationRequest {
  runId: string
  workflowInstanceId: string
  actionKind: string
  targetVersionHash: string
  idempotencyKey: string
  remoteOperationId?: string | null
  /** The ambiguity being investigated. */
  ambiguousOutcome: Extract<ActionOutcome, 'UNKNOWN' | 'PARTIAL'>
}

export interface ReconciliationRecord extends ReconciliationRequest {
  result: ReconciliationResult
  authoritativeSystem: string
  /** Safe, structured facts only — ids, counts, states. Never a raw response. */
  detail: Record<string, string | number | boolean | null>
  observedAt: string
}

/**
 * What an outcome may become given a reconciliation result.
 *
 * `STILL_UNKNOWN` deliberately maps to null: not knowing is a valid answer, and
 * it must leave the incident exactly where it was rather than nudging it toward
 * a guess.
 */
export function resolutionFor(
  result: ReconciliationResult, ambiguous: 'UNKNOWN' | 'PARTIAL',
): ActionOutcome | null {
  switch (result) {
    case 'CONFIRMED_SUCCEEDED':
      // PARTIAL never widens to SUCCEEDED — see isLegalOutcomeTransition.
      return ambiguous === 'UNKNOWN' ? 'SUCCEEDED' : null
    case 'CONFIRMED_NOT_APPLIED':  return 'FAILED'
    case 'CONFIRMED_PARTIAL':      return 'PARTIAL'
    case 'STILL_UNKNOWN':          return null
  }
}

/**
 * Does the recorded answer permit a fresh, human-authorized attempt?
 *
 * Only when the authority positively confirmed nothing was applied. Anything else
 * — including "we still cannot tell" — must not produce a retry, and a new
 * attempt then requires a new attempt_group, a new authorization where the class
 * demands one, and therefore a new idempotency identity. The old identity is
 * never recycled: that is what stops a "retry" from silently becoming a second
 * act on the same approval.
 */
export function permitsFreshAttempt(result: ReconciliationResult): boolean {
  return result === 'CONFIRMED_NOT_APPLIED'
}

export type RecordReconciliationOutcome =
  | { ok: true; reconciliationId: string; resolvesTo: ActionOutcome | null }
  | { ok: false; refusal: 'identity_mismatch' | 'not_a_bound_action' | 'write_failed'; detail: string }

/**
 * Append one reconciliation fact.
 *
 * The database independently re-checks that the row's identity matches the run's
 * (instance, action_kind, target hash, idempotency key), so a reconciliation
 * naming a different action cannot be used to clear an unrelated incident. The
 * table is append-only, enforced by trigger.
 */
export async function recordReconciliation(
  db: AnyDb, record: ReconciliationRecord,
): Promise<RecordReconciliationOutcome> {
  try {
    const { data, error } = await db.from('workflow_action_reconciliations').insert({
      run_id: record.runId,
      workflow_instance_id: record.workflowInstanceId,
      action_kind: record.actionKind,
      target_version_hash: record.targetVersionHash,
      idempotency_key: record.idempotencyKey,
      remote_operation_id: record.remoteOperationId ?? null,
      result: record.result,
      authoritative_system: record.authoritativeSystem,
      detail: record.detail,
      observed_at: record.observedAt,
    }).select('id').maybeSingle()

    if (error) {
      const msg = error.message ?? ''
      const refusal = msg.includes('identity does not match') ? 'identity_mismatch'
        : msg.includes('not a bound workflow action') ? 'not_a_bound_action'
        : 'write_failed'
      return { ok: false, refusal, detail: msg }
    }
    return {
      ok: true, reconciliationId: data.id,
      resolvesTo: resolutionFor(record.result, record.ambiguousOutcome),
    }
  } catch (e) {
    return { ok: false, refusal: 'write_failed', detail: (e as Error).message }
  }
}

export interface OpenIncident {
  runId: string
  workflowInstanceId: string
  actionKind: string
  actionClass: string
  outcome: ActionOutcome
  reason: string | null
  idempotencyKeyPrefix: string
  remoteOperationId: string | null
  reconciliationCount: number
}

/**
 * Every action still awaiting a human. Read-only.
 *
 * Ordered oldest first: an unresolved ambiguity blocks its workflow, so the one
 * that has been blocking longest is the one to look at.
 */
export async function listOpenIncidents(db: AnyDb, projectIds: string[]): Promise<OpenIncident[]> {
  if (projectIds.length === 0) return []
  try {
    const { data } = await db.from('runs')
      .select('id, workflow_instance_id, action_kind, action_class, action_outcome, '
            + 'reconciliation_reason, idempotency_key, remote_operation_id')
      .in('project_id', projectIds)
      .eq('reconciliation_required', true)
      .order('created_at', { ascending: true })
    const rows = (data ?? []) as Record<string, string | null>[]
    if (rows.length === 0) return []

    const { data: recs } = await db.from('workflow_action_reconciliations')
      .select('run_id').in('run_id', rows.map(r => r.id))
    const counts = new Map<string, number>()
    for (const r of (recs ?? []) as { run_id: string }[]) {
      counts.set(r.run_id, (counts.get(r.run_id) ?? 0) + 1)
    }

    return rows.map(r => ({
      runId: r.id!,
      workflowInstanceId: r.workflow_instance_id!,
      actionKind: r.action_kind!,
      actionClass: r.action_class!,
      outcome: r.action_outcome as ActionOutcome,
      reason: r.reconciliation_reason,
      // Prefix only: the full key is an action identity, not a display value.
      idempotencyKeyPrefix: r.idempotency_key ? `${r.idempotency_key.slice(0, 12)}…` : '—',
      remoteOperationId: r.remote_operation_id,
      reconciliationCount: counts.get(r.id!) ?? 0,
    }))
  } catch {
    return []
  }
}
