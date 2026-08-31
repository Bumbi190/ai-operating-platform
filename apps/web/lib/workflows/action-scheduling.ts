/**
 * lib/workflows/action-scheduling.ts — the seam between the scheduler and the
 * READ_ONLY executor.
 *
 * ── THE TICK NEVER EXECUTES ────────────────────────────────────────────────
 * This module creates a bound run and stops. The handler is reached only later,
 * by the drain, through the PR9e executor. That separation is the point: the
 * scheduler decides orchestration readiness, and a bounded observation is
 * performed by something that can be claimed, fenced, cancelled and reaped. A
 * tick that called a handler directly would have none of that.
 *
 * ── CREATE ONLY WHEN NEEDED ────────────────────────────────────────────────
 * Four reasons not to create a run, checked in order of cost:
 *   1. the observation is already satisfied by current PASS evidence
 *   2. an action for this identity is already pending or running
 *   3. the identity exists in a state that has not released it
 *   4. an earlier attempt exhausted its budget — surfacing an error, not looping
 * Without (4) the scheduler would mint a fresh attempt_group every minute and
 * turn a failing observation into an infinite run factory.
 */

import 'server-only'

import { createWorkflowActionRun, type ActionBindingRefusal } from './action-run'
import { discoverReadOnlyActions } from './action-discovery'
import {
  classifyPriorObservation, type IdentityHoldReason, type PriorObservation,
} from './action-identity'
import { evidenceTargetHashFor } from './evidence-binding'
import { summarizeStateEvidence } from './evidence-consumption'
import { findAdapter } from './adapters/registry'
import { listEvidence, readDefinitionById } from './store'
import type { WorkflowInstance } from './types'

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

export type SchedulingOutcome =
  | 'created'
  | 'already_satisfied'
  | 'already_scheduled'
  /** A prior run still owns this action identity. See action-identity.ts. */
  | 'identity_held'
  | 'attempts_exhausted'
  | 'no_action_declared'
  | 'refused'

/** Where a decision was reached. Closed set, so an audit row cannot invent one. */
export type SchedulingStage =
  | 'preflight'      // instance / project preconditions, before any candidate
  | 'discovery'      // the registry declares no action for this def_key + state
  | 'evidence'       // the observation is already recorded as pass
  | 'existing_run'   // a prior run holds the identity or spent its budget
  | 'binding'        // createWorkflowActionRun refused

/**
 * Machine-readable refusal codes. A closed vocabulary on purpose: these reach
 * the audit row, and free text there is how a secret or a stack trace ends up in
 * the database.
 */
export type SchedulingReasonCode =
  | 'instance_not_active'
  | 'project_paused'
  | 'project_pause_unreadable'
  | 'no_canonical_action'
  | 'already_recorded_pass'
  /**
   * `run_retryable` is deliberately absent. It was the PR9h-4 defect in one
   * word: a `done` run reported as retryable, when `claim_runs` only ever
   * claims `pending`. The classifier's vocabulary replaces it, so the mislabel
   * is no longer expressible.
   */
  | IdentityHoldReason
  | 'terminal_prior_released'
  | ActionBindingRefusal

export interface SchedulingDecision {
  actionKind: string | null
  outcome: SchedulingOutcome
  runId?: string
  /**
   * Human-readable, for logs and callers. NEVER persisted: it interpolates
   * `(e as Error).message` on some paths, and an exception body has no business
   * in an audit row.
   */
  detail: string
  /** Persisted. Null only when nothing was refused. */
  reasonCode: SchedulingReasonCode | null
  /** Persisted. Declared check keys only; empty unless the evidence gate spoke. */
  blockingCheckKeys: readonly string[]
  /** Persisted. */
  stage: SchedulingStage
}

/** The bookkeeping row that marks a human asking for another evaluation. */
const EXPLICIT_SCHEDULE_CHECK = 'scheduler.wake_scheduled'

/** Caps for the persisted projection. A bounded row cannot become a payload. */
const MAX_BLOCKING_KEYS = 10
const MAX_KEY_LENGTH = 80

export interface PersistedSchedulingDecision {
  kind: string | null
  outcome: SchedulingOutcome
  stage: SchedulingStage
  reason_code: SchedulingReasonCode | null
  blocking_check_keys: string[]
}

/**
 * The bounded projection written to the tick's evidence row.
 *
 * PR9h could not say WHY a run had been refused without reading source
 * afterwards, because the row carried only {kind, outcome}. reason_code and
 * blocking_check_keys fix that without carrying anything unbounded.
 *
 * Allow-list, not deny-list: it names the five fields that MAY be persisted
 * rather than stripping the ones that may not, so a new free-text field on
 * SchedulingDecision cannot reach the database by being forgotten here.
 */
export function summarizeSchedulingDecision(d: SchedulingDecision): PersistedSchedulingDecision {
  return {
    kind: d.actionKind,
    outcome: d.outcome,
    stage: d.stage,
    reason_code: d.reasonCode,
    blocking_check_keys: d.blockingCheckKeys
      .slice(0, MAX_BLOCKING_KEYS)
      .map(k => k.slice(0, MAX_KEY_LENGTH)),
  }
}

/**
 * Ensure the canonical READ_ONLY observations for an instance's CURRENT state
 * exist as bound runs. Creates at most one run per action kind per tick.
 */
export async function ensureReadOnlyActionRuns(
  db: AnyDb, instance: WorkflowInstance,
): Promise<SchedulingDecision[]> {
  // An inactive instance or a paused project accumulates no new work. Checked
  // HERE rather than by the caller: it is a property of scheduling, and a future
  // second caller must not be able to forget it. createWorkflowActionRun checks
  // both again independently.
  if (instance.status !== 'active') {
    return [{ actionKind: null, outcome: 'refused', stage: 'preflight',
      reasonCode: 'instance_not_active', blockingCheckKeys: [],
      detail: `instance is ${instance.status}` }]
  }
  try {
    const { data: project } = await db.from('projects')
      .select('execution_paused').eq('id', instance.project_id).maybeSingle()
    if (project?.execution_paused === true) {
      return [{ actionKind: null, outcome: 'refused', stage: 'preflight',
        reasonCode: 'project_paused', blockingCheckKeys: [],
        detail: 'project execution is paused' }]
    }
  } catch {
    // Unable to prove the project is unpaused ⇒ do not schedule.
    return [{ actionKind: null, outcome: 'refused', stage: 'preflight',
      reasonCode: 'project_pause_unreadable', blockingCheckKeys: [],
      detail: 'project pause state unreadable' }]
  }

  const candidates = discoverReadOnlyActions(instance.def_key, instance.current_state)
  if (candidates.length === 0) {
    return [{ actionKind: null, outcome: 'no_action_declared', stage: 'discovery',
      reasonCode: 'no_canonical_action', blockingCheckKeys: [],
      detail: `no canonical READ_ONLY action for ${instance.def_key}/${instance.current_state}` }]
  }

  const decisions: SchedulingDecision[] = []
  for (const candidate of candidates) {
    decisions.push(await ensureOne(db, instance, candidate.actionKind, candidate.checkKey))
  }
  return decisions
}

async function ensureOne(
  db: AnyDb, instance: WorkflowInstance, actionKind: string, checkKey: string,
): Promise<SchedulingDecision> {
  /** Newest operator schedule for this instance; null when never scheduled. */
  let lastExplicitScheduleAt: string | null = null
  /** Set when a terminal prior run released its identity, for the audit row. */
  let releasedPrior: string | null = null

  // 1) Already answered? Asked with the CANONICAL satisfaction rules, not with
  //    `result = 'pass'`.
  //
  //    A raw column read was the bug: an unbound or stale PASS is not a
  //    satisfied check — `evaluateCheck` refuses both — but a raw read counts
  //    them, so the seam would decline to schedule the very observation needed
  //    to produce a usable row. That is a deadlock reachable from any legacy
  //    row, and it is the same shape as the one PR9h-2 fixed one layer up.
  //
  //    The logic is not duplicated here: this calls `summarizeStateEvidence`
  //    with the shared pin, exactly as the tick and the pre-run gate do.
  try {
    const adapter = findAdapter(instance.def_key)
    if (adapter) {
      const def = await readDefinitionById(db, instance.def_id)
      const rows = await listEvidence(db, instance.id)
      // The same read answers "was another observation explicitly asked for".
      // `scheduler.wake_scheduled` is written by `workflow_schedule_wake` and
      // nothing else, and that RPC is reachable only from the operator
      // endpoint — the executor's re-arm and the tick's own record write no
      // such row. So this is a human asking, never the machine re-entering.
      lastExplicitScheduleAt = rows
        .filter(r => r.check_key === EXPLICIT_SCHEDULE_CHECK)
        .map(r => r.recorded_at)
        .sort()
        .pop() ?? null
      const summary = summarizeStateEvidence(
        adapter.attestableChecks(), instance.current_state, rows,
        evidenceTargetHashFor(instance, def.spec, instance.current_state, rows))
      const verdict = summary.verdicts.find(v => v.check_key === checkKey)
      if (verdict?.satisfies) {
        return { actionKind, outcome: 'already_satisfied', stage: 'evidence',
          reasonCode: 'already_recorded_pass', blockingCheckKeys: [],
          detail: `${checkKey} is satisfied by evidence bound to the current target` }
      }
    }
  } catch { /* unreadable evidence must not create a run either — fall through */ }

  // 2/3) Does an existing run still OWN this action identity?
  try {
    const { data: existing } = await db.from('runs')
      .select('id, status, attempts, max_attempts, created_at, action_outcome, reconciliation_required')
      .eq('workflow_instance_id', instance.id)
      .eq('action_kind', actionKind)
      .eq('workflow_from_state', instance.current_state)
      .not('status', 'in', '("cancelled","rejected")')
      .order('created_at', { ascending: false }).limit(1)
    const prior = (existing ?? [])[0] as PriorObservation | undefined

    if (prior) {
      // Whether the prior run still owns this identity is a PR9d question about
      // outcome and phase, decided in one pure place. `explicitlyScheduledAt` is
      // what stops a released identity from becoming a loop: the executor
      // re-arms the instance after every run, so without it a terminal
      // observation would mint its own successor forever.
      const disposition = classifyPriorObservation(prior, lastExplicitScheduleAt)
      if (disposition.holds) {
        return {
          actionKind,
          outcome: disposition.reason === 'active_run_exists' ? 'already_scheduled'
            : disposition.reason === 'attempt_budget_spent' ? 'attempts_exhausted'
            : 'identity_held',
          runId: prior.id, stage: 'existing_run',
          reasonCode: disposition.reason, blockingCheckKeys: [], detail: disposition.detail,
        }
      }
      // Released. Fall through to creation, which mints a FRESH attempt_group —
      // a new observation is not attempt 2 of the old run, and the old run is
      // never reopened. `runs` is append-only for binding columns anyway.
      releasedPrior = disposition.detail
    }
  } catch { /* fall through to creation; the unique index is the real guard */ }

  // 4) Create. attempt_group is generated SERVER-SIDE inside
  //    createWorkflowActionRun, and no idempotency key is supplied by anyone —
  //    it is derived from the canonical target, so a repeated tick computes the
  //    same identity and the unique index refuses the duplicate.
  const created = await createWorkflowActionRun(db, { instanceId: instance.id, actionKind })
  if (created.ok) {
    return { actionKind, outcome: 'created', runId: created.runId,
      stage: 'binding',
      reasonCode: releasedPrior === null ? null : 'terminal_prior_released',
      blockingCheckKeys: [],
      detail: releasedPrior ?? `bound run created for ${actionKind}` }
  }
  if (created.refusal === 'duplicate_action_identity') {
    // Lost a race with a concurrent tick. The other tick's run is authoritative;
    // this is "already scheduled", not a scheduler failure.
    return { actionKind, outcome: 'already_scheduled', stage: 'binding',
      reasonCode: 'duplicate_action_identity', blockingCheckKeys: [],
      detail: 'another tick created it first' }
  }
  return {
    actionKind, outcome: 'refused', stage: 'binding',
    reasonCode: created.refusal,
    // Straight from the adapter's declared catalogue; absent for every other
    // refusal, so the audit row never carries keys that were not really checked.
    blockingCheckKeys: created.blockingCheckKeys ?? [],
    detail: `${created.refusal}: ${created.detail}`,
  }
}
