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
import { checkAnsweredBy, discoverReadOnlyActions } from './action-discovery'
import type { WorkflowInstance } from './types'

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

export type SchedulingOutcome =
  | 'created'
  | 'already_satisfied'
  | 'already_scheduled'
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
  | 'run_in_flight'
  | 'run_retryable'
  | 'attempt_budget_spent'
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
  // 1) Already answered? A recorded PASS for this check in this state means the
  //    observation exists; repeating it would only add noise.
  try {
    const { data: evidence } = await db.from('workflow_evidence')
      .select('id').eq('instance_id', instance.id)
      .eq('state', instance.current_state).eq('check_key', checkKey)
      .eq('result', 'pass').limit(1)
    if ((evidence ?? []).length > 0) {
      return { actionKind, outcome: 'already_satisfied', stage: 'evidence',
        reasonCode: 'already_recorded_pass', blockingCheckKeys: [],
        detail: `${checkKey} already recorded as pass` }
    }
  } catch { /* unreadable evidence must not create a run either — fall through */ }

  // 2/3) An existing run for this instance+kind that has not reached a terminal,
  //      identity-releasing state. Pending and running are obvious; 'unknown'
  //      and 'partial' also hold the identity (PR9d), and a failed READ_ONLY run
  //      is a finished attempt, not a licence to mint a new one.
  try {
    const { data: existing } = await db.from('runs')
      .select('id, status, attempts, max_attempts')
      .eq('workflow_instance_id', instance.id)
      .eq('action_kind', actionKind)
      .eq('workflow_from_state', instance.current_state)
      .not('status', 'in', '("cancelled","rejected")')
      .order('created_at', { ascending: false }).limit(1)
    const prior = (existing ?? [])[0] as
      { id: string; status: string; attempts: number; max_attempts: number } | undefined

    if (prior) {
      if (prior.status === 'pending' || prior.status === 'running') {
        return { actionKind, outcome: 'already_scheduled', runId: prior.id,
          stage: 'existing_run', reasonCode: 'run_in_flight', blockingCheckKeys: [],
          detail: `run ${prior.id.slice(0, 8)} is ${prior.status}` }
      }
      if (prior.attempts >= prior.max_attempts) {
        // The retry budget is spent. A new attempt_group here would restart the
        // whole thing every minute; the recorded evidence/escalation is the
        // correct surface for a failing observation.
        return { actionKind, outcome: 'attempts_exhausted', runId: prior.id,
          stage: 'existing_run', reasonCode: 'attempt_budget_spent', blockingCheckKeys: [],
          detail: `run ${prior.id.slice(0, 8)} used ${prior.attempts}/${prior.max_attempts} attempts` }
      }
      // Retryable and not terminal-by-budget: the drain's own retry handles it.
      return { actionKind, outcome: 'already_scheduled', runId: prior.id,
        stage: 'existing_run', reasonCode: 'run_retryable', blockingCheckKeys: [],
        detail: `run ${prior.id.slice(0, 8)} is ${prior.status} with attempts left` }
    }
  } catch { /* fall through to creation; the unique index is the real guard */ }

  // 4) Create. attempt_group is generated SERVER-SIDE inside
  //    createWorkflowActionRun, and no idempotency key is supplied by anyone —
  //    it is derived from the canonical target, so a repeated tick computes the
  //    same identity and the unique index refuses the duplicate.
  const created = await createWorkflowActionRun(db, { instanceId: instance.id, actionKind })
  if (created.ok) {
    return { actionKind, outcome: 'created', runId: created.runId,
      stage: 'binding', reasonCode: null, blockingCheckKeys: [],
      detail: `bound run created for ${actionKind}` }
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
