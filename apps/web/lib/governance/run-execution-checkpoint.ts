/**
 * G3C-3A — the canonical checkpoint for work that is ALREADY CLAIMED.
 *
 * G3C-2A made ADMISSION stop-atomic: after a pause commits, nothing new can be
 * claimed. It says nothing about the run that was claimed one second earlier and
 * is now about to start its third step, or about the workflow action that passed
 * readiness and is about to put packets on the wire.
 *
 * That window is what this owns. Before an already-claimed run begins another
 * execution-bearing unit it must re-establish three independent facts:
 *
 *   1. OWNERSHIP  — this worker still holds the claim;
 *   2. CANCEL     — no durable cancellation intent has landed;
 *   3. AUTHORITY  — canonical global + project stop still permit the work.
 *
 * ── WHY THREE OUTCOMES AND NOT ONE BOOLEAN ─────────────────────────────────
 * They demand different handling and must never be collapsed:
 *
 *   FENCED     another owner holds this run. This worker must touch NOTHING —
 *              not even to record a failure. Anything it believes is stale.
 *   CANCELLED  a human asked for this run to stop. It terminalizes, owned.
 *   STOPPED    governance said no. The run is NOT broken; it goes back to the
 *              queue and resumes when authority clears.
 *
 * None of the three is a provider failure, and none may be reported as one.
 *
 * ── WHY THIS DOES NOT OWN A TRUTH TABLE ────────────────────────────────────
 * The stop answer comes from `resolveExecutionStop`, the same G3A authority
 * every other gate uses. This file reads no `automation_paused` and no
 * `execution_paused`. A second implementation of "is it paused" is how two
 * answers start disagreeing.
 *
 * ── FAIL CLOSED ────────────────────────────────────────────────────────────
 * For execution-bearing work, not knowing is not permission. An unreadable run
 * row is FENCED (ownership cannot be established), and the resolver already
 * returns `stop_state_unavailable` with `allowed: false` for AUTONOMOUS work
 * when it cannot read the authority. That is deliberately unlike
 * `isCancelRequested`, whose read failure returns false — defensible for a
 * best-effort courtesy check, not for a kill switch.
 *
 * ── WHAT THIS DOES NOT PROMISE ─────────────────────────────────────────────
 * The same honest in-flight contract as G3C-1 and G3C-2B. A stop discovered
 * here prevents the NEXT unit. It does not reach into a request already on the
 * wire, and it does not claim the remote side did nothing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolveExecutionStop,
  type ExecutionContext,
  type StopDecision,
  type StopRefusalReason,
} from './execution-stop'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = SupabaseClient<any, any, any>

/** Why an already-claimed run may not continue. Never collapsed into one code. */
export type RunCheckpointRefusal = 'FENCED' | 'CANCELLED' | 'STOPPED'

export type RunCheckpointVerdict =
  | { allowed: true; detail: string }
  | { allowed: false; refusal: 'FENCED'; detail: string }
  | { allowed: false; refusal: 'CANCELLED'; detail: string }
  | {
      allowed: false
      refusal: 'STOPPED'
      detail: string
      reason: StopRefusalReason
      decision: StopDecision
    }

/** Exactly the columns ownership and cancellation are decided from. */
interface OwnershipRow {
  status: string | null
  claim_id: string | null
  cancel_requested: boolean | null
  project_id: string | null
}

export interface RunCheckpointInput {
  runId: string
  /** The run's OWN project. Never a billing slug. */
  projectId: string | null | undefined
  /** The token this invocation was handed by claim_runs. */
  claimId: string | null | undefined
  /** Drain-owned execution is AUTONOMOUS; overridable for other owners. */
  context?: ExecutionContext
  /** Short label for diagnostics only — never an input to the decision. */
  boundary: string
}

/**
 * Establishes fresh truth for one already-claimed run at one boundary.
 *
 * Deliberately decision-only: it never mutates the run. Callers that need to
 * act on a refusal use the ownership-conditioned helpers below, so the decision
 * and the write stay separable and separately testable.
 */
export async function checkpointClaimedRun(
  db: AnyDb, input: RunCheckpointInput,
): Promise<RunCheckpointVerdict> {
  const { runId, claimId, boundary } = input
  const context: ExecutionContext = input.context ?? 'AUTONOMOUS'

  // ── 1 · OWNERSHIP ────────────────────────────────────────────────────────
  // First, because a rotated claim invalidates everything else this worker
  // believes — including which project it thought it was executing for.
  let row: OwnershipRow | null = null
  try {
    const { data, error } = await db.from('runs')
      .select('id, status, claim_id, cancel_requested, project_id')
      .eq('id', runId).maybeSingle()
    if (error) {
      return { allowed: false, refusal: 'FENCED',
        detail: `${boundary}: ownership unreadable — refusing to execute` }
    }
    row = (data ?? null) as OwnershipRow | null
  } catch {
    return { allowed: false, refusal: 'FENCED',
      detail: `${boundary}: ownership unreadable — refusing to execute` }
  }

  if (!row) {
    return { allowed: false, refusal: 'FENCED', detail: `${boundary}: run no longer exists` }
  }
  if (!claimId) {
    // No claim means no ownership. The legacy no-claim caller is a real path;
    // it must not gain permission by virtue of never having had any.
    return { allowed: false, refusal: 'FENCED', detail: `${boundary}: invocation holds no claim` }
  }
  if (row.claim_id !== claimId) {
    return { allowed: false, refusal: 'FENCED',
      detail: `${boundary}: claim rotated — another owner holds this run` }
  }
  if (row.status !== 'running') {
    return { allowed: false, refusal: 'FENCED',
      detail: `${boundary}: run is ${row.status ?? 'gone'}, not running` }
  }

  // ── 2 · EXPLICIT CANCELLATION ────────────────────────────────────────────
  // Deliberately NOT gated on H1_CANCEL. That flag governs the older
  // cooperative helper's rollout; a canonical governance checkpoint whose
  // guarantee evaporates when an unrelated rollout flag is unset is not a
  // guarantee. The route's honesty about latency is preserved separately.
  if (row.cancel_requested === true) {
    return { allowed: false, refusal: 'CANCELLED',
      detail: `${boundary}: cancellation requested` }
  }

  // ── 3 · CANONICAL STOP AUTHORITY ─────────────────────────────────────────
  // The run's own project, read from the row we just fenced against — not from
  // the caller's possibly-stale idea of it.
  const projectId = row.project_id ?? input.projectId ?? null
  const decision = await resolveExecutionStop(db as SupabaseClient, { context, projectId })
  if (!decision.allowed) {
    return {
      allowed: false, refusal: 'STOPPED',
      reason: decision.reason ?? 'stop_state_unavailable',
      decision,
      detail: `${boundary}: ${decision.reason ?? 'stop_state_unavailable'}`,
    }
  }

  return { allowed: true, detail: `${boundary}: owned, uncancelled, authority clear` }
}

/**
 * Hands a stopped run back to the queue, conditioned on still owning it.
 *
 * A governance stop is not a failure: no error text, no failure alert, no retry
 * backoff. The run returns to `pending` exactly as it was and becomes eligible
 * again when authority clears — and NOT before, because claim_runs (G3C-2A)
 * refuses to claim it while the stop stands. That is what bounds this: one
 * claim/release cycle per stop event, not one per drain tick.
 *
 * `attempts` is deliberately NOT decremented. claim_runs increments it at claim
 * time, and reversing that here would be a read-modify-write race against the
 * very concurrency G3C-2A just made atomic. The cost is one consumed attempt
 * per stop crossing; correcting it belongs in G3C-3B, where it can be done in
 * SQL under the same locks.
 */
export async function releaseStoppedRun(
  db: AnyDb, runId: string, claimId: string | null | undefined,
): Promise<{ released: boolean; fenced: boolean }> {
  if (!claimId) return { released: false, fenced: true }
  const { data, error } = await db.from('runs')
    .update({ status: 'pending', claimed_at: null, lease_until: null, claim_id: null })
    .eq('id', runId).eq('status', 'running').eq('claim_id', claimId)
    .select('id')
  if (error) return { released: false, fenced: true }
  const hit = Array.isArray(data) && data.length > 0
  return { released: hit, fenced: !hit }
}

/**
 * Terminalizes an owned run as cancelled.
 *
 * Conditioned on id + status running + claim_id. Zero rows means another owner
 * got there first, and that is FENCING — never a successful cancellation.
 */
export async function terminalizeCancelledRun(
  db: AnyDb, runId: string, claimId: string | null | undefined,
): Promise<{ cancelled: boolean; fenced: boolean }> {
  if (!claimId) return { cancelled: false, fenced: true }
  const { data, error } = await db.from('runs')
    .update({
      status: 'cancelled', finished_at: new Date().toISOString(),
      claimed_at: null, lease_until: null,
    })
    .eq('id', runId).eq('status', 'running').eq('claim_id', claimId)
    .select('id')
  if (error) return { cancelled: false, fenced: true }
  const hit = Array.isArray(data) && data.length > 0
  return { cancelled: hit, fenced: !hit }
}

/** Thrown to unwind an in-progress executor. Carries the distinction with it. */
export class RunCheckpointRefusedError extends Error {
  readonly refusal: RunCheckpointRefusal
  readonly boundary: string
  constructor(refusal: RunCheckpointRefusal, detail: string, boundary: string) {
    super(`run checkpoint refused (${refusal}): ${detail}`)
    this.name = 'RunCheckpointRefusedError'
    this.refusal = refusal
    this.boundary = boundary
  }
}

/** True for any G3C-3A control-flow refusal. Never a provider failure. */
export function isRunCheckpointRefusal(e: unknown): e is RunCheckpointRefusedError {
  return e instanceof RunCheckpointRefusedError
}
