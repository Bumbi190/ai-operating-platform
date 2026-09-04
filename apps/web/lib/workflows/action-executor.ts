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
  ACTION_REGISTRY, isExecutableReadOnly, isGovernedEffectEnabled, lookupAction,
  type ExecutableReadOnlyActionKind,
} from './action-registry'
import { assertWorkflowActionReady, assertWorkflowActionStillAuthorized } from './action-run'
import {
  checkpointClaimedRun, settleRefusal, RunLifecycleWriteError, isRunLifecycleWriteError,
  RunCheckpointRefusedError, isRunCheckpointRefusal,
} from '@/lib/governance/run-execution-checkpoint'
import { computeReleaseInstantHandler } from './handlers/compute-release-instant'
import { probeAnonymousProtectedAccessHandler } from './handlers/probe-anonymous-protected-access'
import type { ReadOnlyHandler, ReadOnlyHandlerOutput } from './handlers/types'
import { outcomeForObservation, type ActionOutcome, type ActionPhase } from './action-outcome'
import { readInstance, readDefinitionById, recordEvidence } from './store'
import { observeReleaseGateHandler } from './handlers/observe-release-gate'
import { composeMonthlyBriefHandler } from './handlers/compose-monthly-brief'
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
  observe_release_gate: observeReleaseGateHandler,
  compose_monthly_brief: composeMonthlyBriefHandler,
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
    // ── G3C-3B · GOVERNANCE WINS BEFORE ORDINARY REFUSAL ACCOUNTING ────────
    // Readiness lists `cancel_requested` and `project_paused` among its
    // blockers, and used to hand both straight to `finalizeRefusal` — which
    // writes through `fencedActionUpdate` WITHOUT distinguishing success from a
    // fence from a database fault, and which requeues a stopped run WITHOUT
    // calling release_stopped_run. Two regressions followed from that:
    //
    //   • the ERROR / FENCED / CANCELLED distinction this slice just
    //     established was reintroduced on exactly this path;
    //   • a project pause committing after the claim consumed an execution
    //     attempt with no compensation, so a future max_attempts=1 write-capable
    //     action would strand on its first pause crossing — a direct R7
    //     violation.
    //
    // So a fresh canonical checkpoint runs FIRST. Its refusals settle through
    // the one canonical mapping; only if it still says ALLOWED do the ordinary,
    // non-governance blockers (target drift, authorization drift, instance
    // drift) reach the failure model.
    //
    // The precedence this buys matters: `project_paused + target_drifted` while
    // the pause still stands is a STOP, not a permanent rejection. The run goes
    // back to the queue and readiness re-evaluates the drift honestly once
    // authority clears — rather than rejecting a run forever on the strength of
    // a check taken while everything was supposed to be halted.
    const gate = await checkpointClaimedRun(db, {
      runId: run.id, claimId, projectId: run.project_id, boundary: 'action:readiness',
    })
    if (!gate.allowed) {
      const settled = await settleRefusal(db, gate.refusal, run.id, claimId)
      if (settled === 'ERROR') {
        throw new RunLifecycleWriteError(run.id, 'action:readiness', gate.detail)
      }
      if (settled === 'FENCED') {
        return { executed: false, refusal: 'fenced', detail: gate.detail }
      }
      return {
        executed: false, refusal: 'not_ready', detail: gate.detail,
        disposition: settled === 'CANCELLED' ? 'cancelled' : 'temporary',
      }
    }
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

  // ── G3C-3A · PRE-DISPATCH CHECKPOINT ────────────────────────────────────
  // The last thing before the packet-emitting phase write. Readiness ran above,
  // but two DB round-trips have happened since — and readiness never consulted
  // the GLOBAL authority at all, so an action claimed before a platform-wide
  // stop sailed straight through it. This re-establishes ownership,
  // cancellation, readiness AND canonical global+project stop as they are now.
  //
  // A governance stop here is TEMPORARY: the action is not rejected and the
  // failure model does not own it. The run returns to the queue and is
  // re-admitted when authority clears — which G3C-2A guarantees is not before.
  const preDispatch = await assertWorkflowActionStillAuthorized(
    db, run.id, claimId, run.project_id)
  if (!preDispatch.allowed) {
    if (preDispatch.refusal === 'STOPPED' || preDispatch.refusal === 'CANCELLED') {
      // G3C-3B: settle the lifecycle write and report what it ACHIEVED. The
      // STOPPED path used to ignore the release result entirely, so an R9
      // cancellation winner was returned as `temporary` while the run was
      // already terminally cancelled.
      const settled = await settleRefusal(db, preDispatch.refusal, run.id, claimId)
      if (settled === 'ERROR') {
        // Not fenced, and above all not a provider outcome: nothing was
        // dispatched, so this must never reach the PR9d ambiguity model.
        throw new RunLifecycleWriteError(run.id, 'action:pre-dispatch', preDispatch.reason)
      }
      if (settled === 'FENCED') {
        return { executed: false, refusal: 'fenced', detail: preDispatch.reason }
      }
      // 'temporary' is the existing vocabulary for a stop: not rejected, not
      // failed, eligible again once authority clears.
      return { executed: false, refusal: 'not_ready', detail: preDispatch.reason,
               disposition: settled === 'CANCELLED' ? 'cancelled' : 'temporary' }
    }
    if (preDispatch.refusal === 'FENCED') {
      // Another owner holds this run. No lifecycle write of any kind.
      return { executed: false, refusal: 'fenced', detail: preDispatch.reason }
    }
    // NOT_READY keeps its existing refusal accounting untouched.
    const disposition = await finalizeRefusal(
      db, run.id, claimId, now, 'not_ready', preDispatch.reason)
    return { executed: false, refusal: 'not_ready', detail: preDispatch.reason, disposition }
  }

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
      // G3C-3A: this handler emits several requests, so each one re-authorises.
      // Governance stays HERE, above the adapter — the adapter only asks.
      beforeAttempt: async () => {
        const again = await assertWorkflowActionStillAuthorized(
          db, run.id, claimId, run.project_id)
        if (again.allowed) return
        // A TYPED sentinel, never a bare Error. A generic Error lands in the
        // catch below, which writes REMOTE_CONFIRMED with an UNKNOWN/PARTIAL
        // outcome and reconciliation_required — i.e. it would claim request N's
        // response was lost, when in fact request N+1 was simply refused before
        // it ever left. Governance refusing the NEXT packet is not evidence
        // about the PREVIOUS one.
        //
        // NOT_READY deliberately keeps the failure model: authorization, target
        // or state genuinely drifted mid-handler, which is not a governance stop.
        if (again.refusal && again.refusal !== 'NOT_READY') {
          throw new RunCheckpointRefusedError(
            again.refusal, again.reason, 'probe:before-request')
        }
        throw new Error(`probe halted before next request: ${again.reason}`)
      },
    })
  } catch (e) {
    // ── G3C-3A · governance control flow, BEFORE the failure model ──────────
    // A mid-handler refusal means the NEXT request never left. It says nothing
    // about whether an earlier request's response was lost, so it must never
    // become REMOTE_CONFIRMED / UNKNOWN / PARTIAL / reconciliation_required.
    if (isRunCheckpointRefusal(e)) {
      if (e.refusal === 'STOPPED' || e.refusal === 'CANCELLED') {
        const settled = await settleRefusal(db, e.refusal, run.id, claimId)
        if (settled === 'ERROR') {
          throw new RunLifecycleWriteError(run.id, 'action:mid-probe', e.message)
        }
        if (settled === 'FENCED') {
          return { executed: false, refusal: 'fenced', detail: e.message }
        }
        return { executed: false, refusal: 'not_ready', detail: e.message,
                 disposition: settled === 'CANCELLED' ? 'cancelled' : 'temporary' }
      }
      // FENCED — another owner holds this run; write nothing at all.
      return { executed: false, refusal: 'fenced', detail: e.message }
    }
    // A lifecycle write failed inside the handler boundary. It is NOT a provider
    // observation: rethrow so the drain reports lifecycle_error rather than
    // letting PR9d record REMOTE_CONFIRMED / UNKNOWN / reconciliation for a call
    // that never happened.
    if (isRunLifecycleWriteError(e)) throw e

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
      // PR9h-3: pin the row to what it is about. The run id is all that is
      // passed — recordEvidence derives the hash from the run's own binding and
      // the pinned definition, so neither this executor nor the handler beneath
      // it can influence what its evidence will be judged against. Without this
      // the row is written unbound and can never satisfy anything, which is how
      // a real PASS would have deadlocked the workflow.
      observation: { runId: run.id },
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

/**
 * Registry entries that exist but deliberately have no executor.
 *
 * The predicate used to be `!== 'read_only_observation'`, which meant the same
 * thing only while read-only was the only executable family. Phase 2B-1 added
 * `governed_effect`, and under the old predicate a governed-effect kind would
 * have been reported as having "no executor" — the single most misleading answer
 * this function could give, since such a kind is precisely the one that CAN act.
 * It now means what its name and this comment always said.
 */
export function nonExecutableActionKinds(): string[] {
  return Object.entries(ACTION_REGISTRY)
    .filter(([, m]) => m.executor_family === 'not_executable')
    .map(([k]) => k).sort()
}

/** Kinds the governed-effect executor may run. Separate from the family type. */
export function governedEffectActionKinds(): string[] {
  return Object.entries(ACTION_REGISTRY)
    .filter(([k, m]) => m.executor_family === 'governed_effect' && isGovernedEffectEnabled(k))
    .map(([k]) => k).sort()
}
