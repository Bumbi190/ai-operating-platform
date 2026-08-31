/**
 * lib/workflows/action-executor.ts — the first, deliberately tiny, execution
 * surface.
 *
 * ── CLOSED BY CONSTRUCTION ──────────────────────────────────────────────────
 * This dispatcher can run exactly one thing today. There is no generic HTTP
 * tool, no URL parameter, no shell, no dynamic import and no provider routing:
 * a kind reaches a handler only by being present in HANDLERS, which is keyed by
 * `ExecutableReadOnlyActionKind` so a MATERIAL_WRITE entry is a TYPE ERROR.
 *
 * Four independent refusals stand between a run and a handler — unknown kind,
 * not-executable family, stored class disagreeing with the registry, and any
 * class other than READ_ONLY. They overlap on purpose: the stored class is
 * immutable but was written by application code, and the registry is the
 * authority, so the two are compared rather than either being trusted alone.
 *
 * ── EXECUTION IS NOT ADVANCEMENT ────────────────────────────────────────────
 * Completing an action records an observation and re-arms the scheduler. It
 * does NOT transition the workflow. The tick still re-derives state, gate,
 * prerequisites and evidence — so a passing action makes the workflow eligible
 * for another look, never eligible to move. This module imports no transition
 * writer, which is asserted by test.
 */

import 'server-only'

import {
  ACTION_REGISTRY, isExecutableReadOnly, lookupAction,
  type ExecutableReadOnlyActionKind,
} from './action-registry'
import { assertWorkflowActionReady } from './action-run'
import { computeReleaseInstantHandler } from './handlers/compute-release-instant'
import { probeAnonymousProtectedAccessHandler } from './handlers/probe-anonymous-protected-access'
import type { ReadOnlyHandler, ReadOnlyHandlerOutput } from './handlers/types'
import { outcomeForObservation, type ActionOutcome, type ActionPhase } from './action-outcome'
import { readInstance, readDefinitionById, recordEvidence } from './store'
import { rearmForAuthorization } from './rearm'

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

/**
 * The whole execution surface. Keyed by the compile-time-narrowed kind, so this
 * map cannot grow a write handler without failing the build.
 */
const HANDLERS: Record<ExecutableReadOnlyActionKind, ReadOnlyHandler> = {
  compute_release_instant: computeReleaseInstantHandler,
  probe_anonymous_protected_access: probeAnonymousProtectedAccessHandler,
}

export type ExecutorRefusal =
  | 'not_an_action_run'
  | 'unknown_action_kind'
  | 'not_executable_family'
  | 'class_mismatch'
  | 'not_read_only'
  | 'no_handler'
  | 'not_ready'
  | 'fenced'

/**
 * What a refusal MEANS for the run. Not every refusal is the same kind of dead
 * end, and mapping them all to one state would either strand recoverable work or
 * retry something that can never succeed.
 *
 *   permanent — the pinned act cannot happen as pinned. Terminal REJECTED. A
 *               corrected attempt needs a NEW action identity, which is the
 *               honest way to say "this is a different act now".
 *   cancelled — asked to stop before the irreversible boundary.
 *   temporary — a condition outside the run changed and may change back
 *               (project paused, spend enforcement not yet active). Requeued.
 *
 * Target drift is deliberately PERMANENT. It is not a transient failure: the
 * approval no longer describes the world, and retrying the same pinned run would
 * attempt something nobody approved.
 */
export type RefusalDisposition = 'permanent' | 'cancelled' | 'temporary'

export const REFUSAL_DISPOSITION: Record<ExecutorRefusal, RefusalDisposition> = {
  not_an_action_run:     'permanent',
  unknown_action_kind:   'permanent',
  not_executable_family: 'permanent',
  class_mismatch:        'permanent',
  not_read_only:         'permanent',
  no_handler:            'permanent',
  not_ready:             'permanent',   // refined per-blocker below
  fenced:                'temporary',   // another owner has it; write nothing
}

/**
 * Readiness blockers that may legitimately clear on their own. Everything else —
 * drift, a closed instance, a project mismatch, a revoked authorization — is
 * permanent for THIS pinned run.
 */
const TEMPORARY_BLOCKERS = ['project_paused', 'spend_enforcement_required']

export interface ExecuteResult {
  executed: boolean
  refusal?: ExecutorRefusal
  detail: string
  outcome?: ActionOutcome
  phase?: ActionPhase
  evidenceResult?: ReadOnlyHandlerOutput['result']
  /** How the refusal was finalized, when one occurred. */
  disposition?: RefusalDisposition
}

interface ActionRunRow {
  id: string
  project_id: string
  status: string
  claim_id: string | null
  cancel_requested: boolean
  workflow_instance_id: string | null
  workflow_from_state: string | null
  action_kind: string | null
  action_class: string | null
  authorization_id: string | null
  attempts: number
  max_attempts: number
}

/**
 * Run one bound READ_ONLY workflow action.
 *
 * `claimId` is the token this invocation was handed by claim_runs. Every write
 * below is fenced on it, so a zombie whose claim was rotated cannot record
 * evidence or finalize a run the new owner is executing.
 */
/**
 * Finalize a refusal so the run never stays `running` holding its claim.
 *
 * Every write is fenced on the claim this invocation was handed: a stale worker
 * must not be able to reject, cancel or requeue a run someone else now owns.
 *
 * Only ever called BEFORE dispatch. After DISPATCH_STARTED the PR9d failure
 * model owns the outcome — an action that may have applied is never "rejected".
 */
async function finalizeRefusal(
  db: AnyDb, runId: string, claimId: string | null, now: string,
  refusal: ExecutorRefusal, detail: string, blockers: string[] = [],
): Promise<RefusalDisposition> {
  // `fenced` means another owner holds the run: write nothing at all.
  if (refusal === 'fenced') return 'temporary'

  let disposition: RefusalDisposition = REFUSAL_DISPOSITION[refusal]
  if (refusal === 'not_ready') {
    if (blockers.includes('cancel_requested')) disposition = 'cancelled'
    else if (blockers.length > 0 && blockers.every(b => TEMPORARY_BLOCKERS.includes(b))) {
      disposition = 'temporary'
    }
  }

  const common = {
    last_error: `${refusal}: ${detail}`,
    claimed_at: null,
    lease_until: null,
    reconciliation_reason: null,
  }

  if (disposition === 'temporary') {
    // Back to rest, claim released, reason recorded. It becomes claimable again
    // when the external condition clears; the attempt budget still bounds it.
    await fencedActionUpdate(db, runId, claimId, { ...common, status: 'pending' })
    return 'temporary'
  }

  const cancelled = disposition === 'cancelled'
  await fencedActionUpdate(db, runId, claimId, {
    ...common,
    status: cancelled ? 'cancelled' : 'rejected',
    // Phase stays null: nothing was dispatched, and claiming otherwise would
    // misreport this to the reaper and the failure model.
    action_outcome: cancelled ? 'CANCELLED' : 'REJECTED',
    outcome_recorded_at: now,
    finished_at: now,
    side_effect_summary: { refusal, disposition, blockers },
  })
  return disposition
}

export async function executeWorkflowAction(
  db: AnyDb, run: ActionRunRow, claimId: string | null, now: string,
): Promise<ExecuteResult> {
  if (!run.workflow_instance_id || !run.action_kind || !run.workflow_from_state) {
    const d = 'run carries no action binding'
    const disposition = await finalizeRefusal(db, run.id, claimId, now, 'not_an_action_run', d)
    return { executed: false, refusal: 'not_an_action_run', detail: d, disposition }
  }

  // ── Gate 1: the kind must be in the canonical registry at all.
  const canonical = lookupAction(run.action_kind)
  if (!canonical) {
    {
    const d = `"${run.action_kind}" is not a canonical action`
    const disposition = await finalizeRefusal(db, run.id, claimId, now, 'unknown_action_kind', d)
    return { executed: false, refusal: 'unknown_action_kind', detail: d, disposition }
  }
  }
  // ── Gate 2: declared executable by an executor that exists.
  if (canonical.executor_family !== 'read_only_observation') {
    {
    const d = `"${run.action_kind}" is declared ${canonical.executor_family}`
    const disposition = await finalizeRefusal(db, run.id, claimId, now, 'not_executable_family', d)
    return { executed: false, refusal: 'not_executable_family', detail: d, disposition }
  }
  }
  // ── Gate 3: the stored class must agree with the registry. The stored value
  //    is immutable but was written by application code; the registry is the
  //    authority, so they are compared rather than either being trusted alone.
  if (run.action_class !== canonical.action_class) {
    {
    const d = `run stores ${run.action_class}, registry says ${canonical.action_class}`
    const disposition = await finalizeRefusal(db, run.id, claimId, now, 'class_mismatch', d)
    return { executed: false, refusal: 'class_mismatch', detail: d, disposition }
  }
  }
  // ── Gate 4: and that agreed class must be READ_ONLY. Belt and braces: gates 2
  //    and 3 already imply it, and this still refuses if either ever loosens.
  if (canonical.action_class !== 'READ_ONLY' || !isExecutableReadOnly(run.action_kind)) {
    {
    const d = `"${run.action_kind}" is not a READ_ONLY observation`
    const disposition = await finalizeRefusal(db, run.id, claimId, now, 'not_read_only', d)
    return { executed: false, refusal: 'not_read_only', detail: d, disposition }
  }
  }

  const handler = HANDLERS[run.action_kind as ExecutableReadOnlyActionKind]
  if (!handler) {
    const d = 'no handler registered'
    const disposition = await finalizeRefusal(db, run.id, claimId, now, 'no_handler', d)
    return { executed: false, refusal: 'no_handler', detail: d, disposition }
  }

  // ── Binding, pause, cancel, target and evidence are all re-derived here.
  const readiness = await assertWorkflowActionReady(db, run.id)
  if (!readiness.ready) {
    const disposition = await finalizeRefusal(
      db, run.id, claimId, now, 'not_ready', readiness.detail, readiness.blockers)
    return { executed: false, refusal: 'not_ready', detail: readiness.detail, disposition }
  }

  const instance = await readInstance(db, run.workflow_instance_id)
  if (!instance) {
    const d = 'instance disappeared between checks'
    const disposition = await finalizeRefusal(db, run.id, claimId, now, 'not_ready', d, ['instance_missing'])
    return { executed: false, refusal: 'not_ready', detail: d, disposition }
  }
  const def = await readDefinitionById(db, instance.def_id)

  // ── Phase: a READ_ONLY observation still records that it started, so the
  //    reaper and the failure model can reason about it exactly as they would
  //    about a write. Nothing about the phase model is special-cased here.
  const started = await fencedActionUpdate(db, run.id, claimId, {
    action_phase: 'DISPATCH_STARTED',
    dispatch_started_at: now,
  })
  if (started.fenced) return { executed: false, refusal: 'fenced', detail: 'claim rotated before dispatch' }

  let output: ReadOnlyHandlerOutput
  try {
    output = await handler({
      instanceKey: instance.instance_key,
      state: run.workflow_from_state,
      defKey: def.def_key,
      defVersion: def.version,
      now,
    })
  } catch (e) {
    // A handler that throws produced no observation. For a pure computation this
    // is a defect, not ambiguity — but the phase says we dispatched, so the
    // honest outcome comes from the model rather than from a guess here.
    const outcome = outcomeForObservation('response_lost', 'DISPATCH_STARTED')
    await fencedActionUpdate(db, run.id, claimId, {
      action_phase: 'REMOTE_CONFIRMED',
      action_outcome: outcome,
      reconciliation_required: outcome === 'UNKNOWN' || outcome === 'PARTIAL',
      outcome_recorded_at: now,
      last_error: e instanceof Error ? e.message : 'handler threw',
    })
    // Deliberately NOT finalizeRefusal: the phase says DISPATCH_STARTED, so the
    // PR9d failure model owns this outcome. An action that may have applied is
    // never "rejected".
    return { executed: false, refusal: 'not_ready', detail: 'handler threw; no evidence recorded', outcome }
  }

  // ── Evidence BEFORE the terminal outcome. If this write fails the action is
  //    SUCCEEDED_EVIDENCE_PENDING, never SUCCEEDED — the observation happened,
  //    our audit did not. For a pure computation nothing is duplicated by a
  //    later retry, but the distinction is kept so the flow is the same one a
  //    write will use.
  let evidenceRecorded = true
  try {
    await recordEvidence(db, {
      instanceId: instance.id,
      state: run.workflow_from_state,
      checkKey: output.checkKey,
      result: output.result,
      source: 'automated',            // hardcoded: a handler cannot claim attestation
      detail: {
        ...output.detail,
        action_kind: run.action_kind,
        expected: output.expected,
        observed: output.observed,
        authoritative_system: output.authoritativeSystem,
        run_id: run.id,
      },
    })
  } catch {
    evidenceRecorded = false
  }

  const outcome: ActionOutcome = evidenceRecorded
    ? (output.result === 'pass' ? 'SUCCEEDED' : 'FAILED')
    : 'SUCCEEDED_EVIDENCE_PENDING'

  const finalized = await fencedActionUpdate(db, run.id, claimId, {
    action_phase: evidenceRecorded ? 'COMPLETE' : 'REMOTE_CONFIRMED',
    action_outcome: outcome,
    remote_confirmed_at: now,
    outcome_recorded_at: now,
    status: outcome === 'SUCCEEDED' ? 'done' : outcome === 'FAILED' ? 'done' : 'partial',
    reconciliation_required: !evidenceRecorded,
    reconciliation_reason: evidenceRecorded ? null
      : 'observation completed but its evidence write failed; record the evidence, do not repeat the action',
    finished_at: now,
    claimed_at: null,
    lease_until: null,
    side_effect_summary: {
      action_kind: run.action_kind, check_key: output.checkKey,
      result: output.result, evidence_recorded: evidenceRecorded,
    },
  })
  if (finalized.fenced) {
    return { executed: false, refusal: 'fenced', detail: 'claim rotated before finalize' }
  }

  // ── Re-arm, never advance. The tick re-derives everything; a passing action
  //    buys the workflow an earlier LOOK, not a transition.
  if (run.authorization_id) {
    await rearmForAuthorization(db, run.authorization_id)
  } else {
    await db.from('workflow_instances')
      .update({ wake_at: now }).eq('id', instance.id).eq('status', 'active')
  }

  return {
    executed: true, detail: `${run.action_kind} → ${output.result}`,
    outcome, phase: evidenceRecorded ? 'COMPLETE' : 'REMOTE_CONFIRMED',
    evidenceResult: output.result,
  }
}

/**
 * Every write from an executing action is conditioned on its claim_id — the same
 * fencing contract the drain uses, applied here so a reclaimed run cannot be
 * written by the invocation that lost it.
 */
async function fencedActionUpdate(
  db: AnyDb, runId: string, claimId: string | null, payload: Record<string, unknown>,
): Promise<{ fenced: boolean }> {
  if (!claimId) {
    // No claim means no ownership. Refusing is safer than writing unconditionally.
    return { fenced: true }
  }
  const { data, error } = await db.from('runs')
    .update(payload).eq('id', runId).eq('claim_id', claimId).select('id')
  if (error) return { fenced: true }
  return { fenced: !data || data.length === 0 }
}

/** True when a claimed run is a bound workflow action the drain should route here. */
export function isWorkflowActionRun(run: { workflow_instance_id?: string | null }): boolean {
  return !!run.workflow_instance_id
}

/** The kinds this executor can run today. Exposed for diagnostics and tests. */
export function executableActionKinds(): string[] {
  return Object.keys(HANDLERS).sort()
}

/** Registry entries that exist but deliberately have no executor. */
export function nonExecutableActionKinds(): string[] {
  return Object.entries(ACTION_REGISTRY)
    .filter(([, m]) => m.executor_family !== 'read_only_observation')
    .map(([k]) => k).sort()
}
