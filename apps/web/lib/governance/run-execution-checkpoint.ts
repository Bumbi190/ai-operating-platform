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
import { classifyRunAuthority, readRunAuthority } from './run-authority'
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

  // ── 1 · OWNERSHIP AND CANCELLATION ───────────────────────────────────────
  // Ownership first, because a rotated claim invalidates everything else this
  // worker believes — including which project it thought it was executing for.
  //
  // G3C-3C-A moved this truth table into `classifyRunAuthority` so the in-flight
  // authority watcher can reuse it verbatim instead of growing a rival copy —
  // the failure mode that produced two competing cancel branches before G3C-3B
  // deleted them. The behaviour here is UNCHANGED; the mapping below is the
  // only place that can change it, and a compatibility test pins every outcome.
  const read = await readRunAuthority(db, runId)
  const verdict = classifyRunAuthority(read, claimId)

  if (verdict.klass !== 'CONTINUE_TO_STOP_CHECK') {
    // ── THE COMPATIBILITY COLLAPSE ─────────────────────────────────────────
    // `AUTHORITY_UNAVAILABLE` is a distinction the WATCHER needs and this
    // boundary deliberately does not make: an admission checkpoint that cannot
    // read ownership must refuse, and G3C-3A has always called that refusal
    // FENCED with this exact detail string. Collapsing here — and only here —
    // keeps that public contract byte-identical while letting the watcher tell
    // "I could not read" from "I read, and you have lost the run".
    const refusal = verdict.klass === 'CANCELLED' ? 'CANCELLED' : 'FENCED'
    return { allowed: false, refusal, detail: `${boundary}: ${verdict.detail}` }
  }

  // ── 2 · CANONICAL STOP AUTHORITY ─────────────────────────────────────────
  // Deliberately NOT gated on H1_CANCEL — see `classifyRunAuthority`. The run's
  // own project comes from the row we just fenced against, not from the
  // caller's possibly-stale idea of it.
  const row = read.kind === 'ROW' ? read.row : null
  const projectId = row?.project_id ?? input.projectId ?? null
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
 * What a lifecycle write actually did.
 *
 * G3C-3A collapsed a database fault into `fenced: true`. That was safe — both
 * mean "write nothing, start nothing" — but it was diagnostically false:
 * FENCED is a claim about OWNERSHIP, and reporting a dropped connection as lost
 * ownership sends an operator looking for a second worker that never existed.
 *
 * ERROR and FENCED remain behaviourally identical at every call site. They
 * differ only in what they say happened.
 */
export type ReleaseResult = 'RELEASED' | 'CANCELLED' | 'FENCED' | 'ERROR'
export type TerminalResult = 'CANCELLED' | 'FENCED' | 'ERROR'

/**
 * Hands a stopped run back to the queue — unless a cancellation got there first.
 *
 * A governance stop is not a failure: no error text, no failure alert, no retry
 * backoff. The run returns to `pending` and becomes eligible again when
 * authority clears — and NOT before, because claim_runs (G3C-2A) refuses to
 * claim it while the stop stands. That bounds this to one claim/release cycle
 * per stop event, not one per drain tick.
 *
 * G3C-3B moved the write into SQL (`release_stopped_run`) for two reasons that
 * TypeScript cannot satisfy:
 *
 *   1. CANCELLATION IS READ INSIDE THE WRITE. A cancel committing between the
 *      STOP decision and this call would otherwise be overwritten by a blind
 *      requeue, leaving `pending + cancel_requested = true` — a row claim_runs
 *      now refuses and the reaper never sees, because it matches `running` only.
 *      Ownerless, forever. The RPC terminalizes `cancelled` in that case.
 *
 *   2. THE ADMISSION IS COMPENSATED ATOMICALLY. claim_runs counts admissions,
 *      and a stop is not an execution attempt. Reversing it here would be a
 *      read-modify-write race; in SQL it is one conditional write under the row
 *      lock. This matters far beyond tidiness: a CHECK constraint forces
 *      `max_attempts = 1` on every non-READ_ONLY/REVERSIBLE_WRITE action, so
 *      without compensation a SINGLE stop crossing would strand a material run
 *      permanently — pending, unclaimable, unreapable.
 */
export async function releaseStoppedRun(
  db: AnyDb, runId: string, claimId: string | null | undefined,
): Promise<ReleaseResult> {
  if (!claimId) return 'FENCED'
  const { data, error } = await db.rpc('release_stopped_run', {
    p_run_id: runId, p_claim_id: claimId,
  })
  if (error) return 'ERROR'
  return data === 'RELEASED' || data === 'CANCELLED' ? data : 'FENCED'
}

/**
 * Terminalizes an owned run as cancelled.
 *
 * Conditioned on id + status running + claim_id. Zero rows means another owner
 * got there first, and that is FENCING — never a successful cancellation. A
 * database fault is neither: it reports ERROR.
 */
export async function terminalizeCancelledRun(
  db: AnyDb, runId: string, claimId: string | null | undefined,
): Promise<TerminalResult> {
  if (!claimId) return 'FENCED'
  const { data, error } = await db.from('runs')
    .update({
      status: 'cancelled', finished_at: new Date().toISOString(),
      claimed_at: null, lease_until: null,
    })
    .eq('id', runId).eq('status', 'running').eq('claim_id', claimId)
    .select('id')
  if (error) return 'ERROR'
  return Array.isArray(data) && data.length > 0 ? 'CANCELLED' : 'FENCED'
}

/** What an ownership-conditioned dispatch-unknown write actually did. */
export type DispatchUnknownResult = 'UNKNOWN_WRITTEN' | 'FENCED' | 'ERROR'

/**
 * Records an owned run as DURABLY AMBIGUOUS after governance aborted a request
 * that was already in flight.
 *
 * ── WHY UNKNOWN AND NOT CANCELLED ──────────────────────────────────────────
 * We hung up a socket. That is the entire extent of what we did. The provider
 * may have accepted the request, may be running it, may already have charged
 * for it. Every other status would be a claim we cannot support:
 *
 *   cancelled  claims the remote effect did not happen.
 *   failed     records a governance decision as an execution failure, and feeds
 *              retry backoff and failure counters.
 *   pending    re-dispatches. If the first request DID land, the second one
 *              duplicates real, billable, possibly externally-visible work —
 *              the single worst outcome available here.
 *
 * `unknown` + `reconciliation_required` is the vocabulary the G3C-3B reaper
 * already uses for exactly this class: a run whose dispatch cannot be
 * determined. Reusing it means one ambiguity model and one operator surface
 * (`runs_reconciliation_required_idx`), not a second dialect.
 *
 * ── WHAT IS DELIBERATELY NOT SET ───────────────────────────────────────────
 * `action_outcome` stays untouched. The constraint is one-directional —
 * UNKNOWN/PARTIAL *requires* reconciliation, not the reverse — so a non-action
 * agent run does not need one, and inventing an action outcome for a run that
 * has no action identity would be fabricating a fact.
 *
 * `cancel_requested` is preserved: the operator's instruction is still true and
 * still the reason a human is being asked to look.
 *
 * ── WHY OWNERSHIP-CONDITIONED ──────────────────────────────────────────────
 * The same predicate every other terminal write in this module uses. A worker
 * that lost its claim mid-abort must not stamp UNKNOWN over the new owner's
 * row; 0 rows matched means FENCED, and the new owner decides.
 */
export async function recordDispatchUnknown(
  db: AnyDb,
  runId: string,
  claimId: string | null | undefined,
  reconciliationReason: string,
): Promise<DispatchUnknownResult> {
  if (!claimId) return 'FENCED'
  const { data, error } = await db.from('runs')
    .update({
      status: 'unknown',
      reconciliation_required: true,
      reconciliation_reason: reconciliationReason,
      finished_at: new Date().toISOString(),
      claimed_at: null, lease_until: null,
    })
    .eq('id', runId).eq('status', 'running').eq('claim_id', claimId)
    .select('id')
  if (error) return 'ERROR'
  return Array.isArray(data) && data.length > 0 ? 'UNKNOWN_WRITTEN' : 'FENCED'
}

/**
 * The FINAL owned boundary, immediately before terminal success.
 *
 * The per-step checkpoint cannot cover this race. A cancellation that commits
 * WHILE the last execution-bearing unit is in flight is never seen by it: the
 * last checkpoint already said yes, the unit returns successfully, and there is
 * no next step to check. Without this, a worker writes `done` over a
 * cancellation that landed seconds earlier — which would make the cancel route's
 * `enforced: true` false advertising.
 *
 * ── WHY THIS DOES NOT CONSULT GOVERNANCE STOP ──────────────────────────────
 * Deliberate, and the distinction is load-bearing. A stop controls whether NEW
 * execution-bearing work may BEGIN. By the time we are here the work is already
 * done — the packets left, the provider answered, the effect exists. Refusing to
 * record that because a stop arrived afterwards would not undo anything; it
 * would throw away honest bookkeeping and push the run back to `pending`, where
 * a later resume could execute it a SECOND time. Stop must not destroy evidence,
 * and it must not manufacture duplicate execution.
 *
 * So this boundary asks two questions only: do we still own this run, and did a
 * human ask for it to stop?
 */
export type FinalizationVerdict = 'CONTINUE_FINALIZATION' | 'CANCELLED' | 'FENCED'

export async function checkOwnedFinalization(
  db: AnyDb, runId: string, claimId: string | null | undefined,
): Promise<FinalizationVerdict> {
  if (!claimId) return 'FENCED'
  try {
    const { data, error } = await db.from('runs')
      .select('id, status, claim_id, cancel_requested')
      .eq('id', runId).maybeSingle()
    if (error || !data) return 'FENCED'
    const row = data as { status: string | null; claim_id: string | null; cancel_requested: boolean | null }
    if (row.claim_id !== claimId) return 'FENCED'
    if (row.status !== 'running') return 'FENCED'
    return row.cancel_requested === true ? 'CANCELLED' : 'CONTINUE_FINALIZATION'
  } catch {
    // Unreadable ownership at finalization is FENCED, never a licence to write.
    return 'FENCED'
  }
}

/**
 * An ownership-conditioned terminal write.
 *
 * `fencedRunUpdate` is gated on H1_FENCING and, when that flag is unset, falls
 * through to an unconditional `update().eq('id', …)` with no claim predicate at
 * all. A read followed by an unconditional write is not ownership — the row can
 * change between the two. This carries the predicate unconditionally, so the
 * guarantee does not depend on a rollout flag.
 */
export async function terminalizeOwnedRun(
  db: AnyDb, runId: string, claimId: string | null | undefined,
  payload: Record<string, unknown>,
): Promise<{ written: boolean; fenced: boolean }> {
  if (!claimId) return { written: false, fenced: true }
  const { data, error } = await db.from('runs')
    .update(payload)
    .eq('id', runId).eq('status', 'running').eq('claim_id', claimId)
    .select('id')
  if (error) return { written: false, fenced: true }
  const hit = Array.isArray(data) && data.length > 0
  return { written: hit, fenced: !hit }
}

/**
 * The terminal compare-and-set: a success-like transition commits ONLY while
 * this worker still owns the running run AND no durable cancellation exists at
 * the instant of the write.
 *
 * ── WHY A PRE-READ IS NOT ENOUGH ───────────────────────────────────────────
 * `checkOwnedFinalization` reads, then the success write happens later. That is
 * a read/check/write TOCTOU, and shrinking the gap does not close it:
 *
 *   T1  the read observes cancel_requested = false
 *   T2  a cancellation commits — status is still running, claim still ours
 *   T3  the success UPDATE matches on (id, status, claim_id) and writes `done`
 *
 * The cancellation committed BEFORE terminal success and still lost. The only
 * fix is to make the cancellation condition part of the same conditional write,
 * so Postgres' row-update semantics decide the order:
 *
 *   success takes the row first → status leaves 'running', a later
 *                                 request_run_cancel matches zero rows → DONE wins
 *   cancel takes the row first  → `cancel_requested = false` no longer holds,
 *                                 the success CAS matches zero rows → CANCEL wins
 *
 * `runs.cancel_requested` is NOT NULL DEFAULT false in production, so the
 * predicate is unambiguous — there is no three-valued-logic hole to fall through.
 *
 * ── GOVERNANCE STOP IS DELIBERATELY ABSENT ─────────────────────────────────
 * Same reasoning as checkOwnedFinalization. The work has already happened; a
 * stop arriving now must not prevent honest result, evidence and audit
 * persistence, or the run would return to `pending` where a resume could execute
 * it a second time. Ownership + explicit cancellation only.
 */
export type OwnedTerminalOutcome = 'SUCCEEDED' | 'CANCELLED' | 'FENCED' | 'ERROR'

export interface OwnedTerminalResult {
  outcome: OwnedTerminalOutcome
  detail: string
}

export async function finalizeOwnedRunUnlessCancelled(
  db: AnyDb, runId: string, claimId: string | null | undefined,
  successPayload: Record<string, unknown>,
): Promise<OwnedTerminalResult> {
  if (!claimId) return { outcome: 'FENCED', detail: 'invocation holds no claim' }

  // ── 1 · the success CAS ──────────────────────────────────────────────────
  const { data, error } = await db.from('runs')
    .update(successPayload)
    .eq('id', runId).eq('status', 'running').eq('claim_id', claimId)
    .eq('cancel_requested', false)
    .select('id')

  if (error) {
    // A database fault is NOT fencing and NOT cancellation. Collapsing it into
    // either would report a specific lifecycle conclusion we have not
    // established.
    return { outcome: 'ERROR', detail: `terminal CAS failed: ${error.message}` }
  }
  if (Array.isArray(data) && data.length > 0) {
    return { outcome: 'SUCCEEDED', detail: 'owned, uncancelled — terminal success committed' }
  }

  // ── 2 · zero rows: establish WHY ─────────────────────────────────────────
  // Deliberately not labelled fenced on sight. The row may still be ours and
  // running, with a cancellation that arrived inside the window.
  const { data: row, error: readErr } = await db.from('runs')
    .select('id, status, claim_id, cancel_requested')
    .eq('id', runId).maybeSingle()
  if (readErr) {
    return { outcome: 'ERROR', detail: `state unresolvable after CAS miss: ${readErr.message}` }
  }
  if (!row) return { outcome: 'FENCED', detail: 'run no longer exists' }

  const r = row as { status: string | null; claim_id: string | null; cancel_requested: boolean | null }
  const stillOurs = r.claim_id === claimId && r.status === 'running'
  if (!stillOurs) {
    return { outcome: 'FENCED',
      detail: `ownership or status changed (status=${r.status}) — another owner decides` }
  }
  if (r.cancel_requested !== true) {
    // Ours, running, uncancelled, yet the CAS missed. Nothing here may be
    // guessed at — report it rather than inventing a lifecycle conclusion.
    return { outcome: 'ERROR', detail: 'terminal CAS missed with no explaining state change' }
  }

  // ── 3 · cancellation won the row ─────────────────────────────────────────
  const { data: cancelled, error: cancelErr } = await db.from('runs')
    .update({
      status: 'cancelled', finished_at: new Date().toISOString(),
      claimed_at: null, lease_until: null,
    })
    .eq('id', runId).eq('status', 'running').eq('claim_id', claimId)
    .eq('cancel_requested', true)
    .select('id')
  if (cancelErr) {
    return { outcome: 'ERROR', detail: `cancellation write failed: ${cancelErr.message}` }
  }
  return Array.isArray(cancelled) && cancelled.length > 0
    ? { outcome: 'CANCELLED', detail: 'cancellation committed before terminal success' }
    : { outcome: 'FENCED', detail: 'lost the row while resolving cancellation' }
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

/**
 * The owned lifecycle WRITE failed — not ownership loss, not a provider failure.
 *
 * Its own type because every other classification would be a lie with
 * consequences: `FENCED` sends an operator hunting a second worker that never
 * existed; a provider failure feeds retry backoff, failure counters and — for a
 * workflow action — the PR9d ambiguity model, which would record
 * UNKNOWN/reconciliation for a remote call that was never made.
 *
 * The only safe response is to touch nothing and start nothing. The run keeps
 * its lease; expiry and the reaper decide its durable state.
 */
export class RunLifecycleWriteError extends Error {
  readonly runId: string
  readonly boundary: string
  constructor(runId: string, boundary: string, detail: string) {
    super(`run lifecycle write failed at ${boundary}: ${detail}`)
    this.name = 'RunLifecycleWriteError'
    this.runId = runId
    this.boundary = boundary
  }
}

export function isRunLifecycleWriteError(e: unknown): e is RunLifecycleWriteError {
  return e instanceof RunLifecycleWriteError
}

/** What a refusal ACTUALLY resolved to once its lifecycle write was attempted. */
export type SettledRefusal = 'STOPPED' | 'CANCELLED' | 'FENCED' | 'ERROR'

/**
 * Performs the lifecycle write a refusal calls for, and reports what really
 * happened — which is not always what the checkpoint decided.
 *
 * Every caller previously did this inline and then discarded the result, so a
 * STOPPED refusal was reported as `deferred_by_stop` even when the release had
 * actually terminalized the run as CANCELLED (the R9 winner), and a database
 * fault was reported as lost ownership. Centralising it means there is one place
 * where the mapping can be read, and no call site that can quietly ignore it.
 *
 *   STOPPED  → release: RELEASED → 'STOPPED' · CANCELLED → 'CANCELLED'
 *                       FENCED   → 'FENCED'  · ERROR     → 'ERROR'
 *   CANCELLED→ terminalize: CANCELLED → 'CANCELLED' · FENCED → 'FENCED'
 *                           ERROR     → 'ERROR'
 *   FENCED   → writes nothing at all, by definition.
 */
export async function settleRefusal(
  db: AnyDb,
  refusal: RunCheckpointRefusal,
  runId: string,
  claimId: string | null | undefined,
): Promise<SettledRefusal> {
  if (refusal === 'FENCED') return 'FENCED'
  if (refusal === 'CANCELLED') {
    const r = await terminalizeCancelledRun(db, runId, claimId)
    return r === 'CANCELLED' ? 'CANCELLED' : r
  }
  const r = await releaseStoppedRun(db, runId, claimId)
  return r === 'RELEASED' ? 'STOPPED' : r
}
