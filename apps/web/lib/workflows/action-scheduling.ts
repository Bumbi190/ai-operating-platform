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

import { createWorkflowActionRun } from './action-run'
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

export interface SchedulingDecision {
  actionKind: string | null
  outcome: SchedulingOutcome
  runId?: string
  detail: string
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
    return [{ actionKind: null, outcome: 'refused', detail: `instance is ${instance.status}` }]
  }
  try {
    const { data: project } = await db.from('projects')
      .select('execution_paused').eq('id', instance.project_id).maybeSingle()
    if (project?.execution_paused === true) {
      return [{ actionKind: null, outcome: 'refused', detail: 'project execution is paused' }]
    }
  } catch {
    // Unable to prove the project is unpaused ⇒ do not schedule.
    return [{ actionKind: null, outcome: 'refused', detail: 'project pause state unreadable' }]
  }

  const candidates = discoverReadOnlyActions(instance.def_key, instance.current_state)
  if (candidates.length === 0) {
    return [{ actionKind: null, outcome: 'no_action_declared',
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
      return { actionKind, outcome: 'already_satisfied', detail: `${checkKey} already recorded as pass` }
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
          detail: `run ${prior.id.slice(0, 8)} is ${prior.status}` }
      }
      if (prior.attempts >= prior.max_attempts) {
        // The retry budget is spent. A new attempt_group here would restart the
        // whole thing every minute; the recorded evidence/escalation is the
        // correct surface for a failing observation.
        return { actionKind, outcome: 'attempts_exhausted', runId: prior.id,
          detail: `run ${prior.id.slice(0, 8)} used ${prior.attempts}/${prior.max_attempts} attempts` }
      }
      // Retryable and not terminal-by-budget: the drain's own retry handles it.
      return { actionKind, outcome: 'already_scheduled', runId: prior.id,
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
      detail: `bound run created for ${actionKind}` }
  }
  if (created.refusal === 'duplicate_action_identity') {
    // Lost a race with a concurrent tick. The other tick's run is authoritative;
    // this is "already scheduled", not a scheduler failure.
    return { actionKind, outcome: 'already_scheduled', detail: 'another tick created it first' }
  }
  return { actionKind, outcome: 'refused', detail: `${created.refusal}: ${created.detail}` }
}
