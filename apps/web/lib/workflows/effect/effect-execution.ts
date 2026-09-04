/**
 * lib/workflows/effect/effect-execution.ts — the governed-effect branch.
 *
 * Reached only after the read-only executor has already established everything
 * an effect and an observation have in common: the run is a bound action run,
 * the kind is canonical, the stored class agrees with the registry, the kind is
 * on the per-kind allowlist, readiness passed, and the G3C-3A checkpoint has
 * just re-established ownership, cancellation and global+project stop.
 *
 * What is added here is what only an effect needs: a spend reservation when the
 * class demands one, and an evidence gate that refuses to claim success the
 * certainty model does not support.
 *
 * ── WHY THIS IS A BRANCH AND NOT A SECOND EXECUTOR ──────────────────────────
 * Duplicating the surrounding 300 lines — readiness ordering, G3C-3B refusal
 * accounting, fenced writes, the phase model, retry — to gain a standalone
 * function would be a larger change and a worse one: two copies of interleaved
 * governance drift, and the copy that drifts is the one nobody is watching.
 */

import 'server-only'

import { withGovernedSpend, ProviderNotDispatchedError } from '@/lib/cost/governed-spend'
import type { ExecutionContract } from '@/lib/governance/execution-stop'
import { fencedActionUpdate, type ExecuteResult } from '../action-executor'
import { assertWorkflowActionStillAuthorized } from '../action-run'
import { outcomeForObservation, decideRetry, type ActionOutcome } from '../action-outcome'
import type { ActionClass } from '../action-target'
import { governedEffectRequirements, mayRecordSuccessEvidence } from './governed-effect'
import { effectHandlerFor } from './effect-handlers'
import type { EffectHandlerOutput } from './effect-handler'

// any: the Supabase client in this project has no generated DB types.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = any

export interface GovernedEffectInput {
  db: AnyDb
  run: any
  claimId: string | null
  now: string
  canonical: { action_class: ActionClass }
  instance: any
  def: any
  /**
   * Built ABOVE this module and forwarded, never constructed here.
   *
   * Policy belongs above the boundary: a module that could name its own
   * execution context could name the permissive one. The executor knows why the
   * work is running — the scheduler reached it — so it names the context and
   * this branch only passes it on.
   */
  execution: ExecutionContract
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** A spend refusal, carried out of the governed-spend callback. */
class SpendDeniedError extends Error {
  constructor(reason: string) { super(reason); this.name = 'SpendDeniedError' }
}

/**
 * What the executor should record on this branch's behalf.
 *
 * The branch does NOT write evidence itself. `action-executor.ts` is the single
 * writer of AUTOMATED evidence in this codebase — a property a guard asserts by
 * listing the exact files allowed to call `recordEvidence` — and adding a second
 * writer would trade that guarantee for a convenience. So the branch decides
 * WHAT is true and the executor decides that it is written.
 */
export interface GovernedEffectEvidence {
  readonly checkKey: string
  readonly result: 'pass' | 'fail'
  readonly expected: string
  readonly observed: string
  readonly detail: Record<string, string | number | boolean | null>
}

export interface GovernedEffectOutcome extends ExecuteResult {
  /** Present when the effect answered a declared check. */
  readonly evidence?: GovernedEffectEvidence
}

export async function executeGovernedEffect(
  input: GovernedEffectInput,
): Promise<GovernedEffectOutcome> {
  const { db, run, claimId, now, canonical, instance, def } = input
  const requirements = governedEffectRequirements(canonical.action_class)

  const handler = effectHandlerFor(run.action_kind)
  if (!handler) {
    return { executed: false, refusal: 'no_handler', detail: 'no effect handler registered' }
  }

  const handlerInput = {
    runId: run.id,
    claimId,
    projectId: run.project_id,
    instanceId: instance.id,
    instanceKey: instance.instance_key,
    state: run.workflow_from_state,
    defKey: def.def_key,
    defVersion: def.version,
    defHash: instance.def_hash,
    targetVersionHash: run.target_version_hash,
    attemptGroup: run.attempt_group ?? '',
    idempotencyKey: run.idempotency_key ?? '',
    now,
    db,
    /**
     * G3C-3A once more, immediately before the irreversible act. The checkpoint
     * already ran in the executor, but a handler may do local work first, and a
     * stop committing in between must prevent the effect rather than only the
     * next one. Throws — a boolean could be ignored.
     */
    beforeDispatch: async () => {
      const again = await assertWorkflowActionStillAuthorized(db, run.id, claimId, run.project_id)
      if (!again.allowed) {
        throw new Error(`governed effect halted before dispatch: ${again.reason}`)
      }
    },
  }

  // ── The phase write. Everything after this point may have touched the world.
  const started = await fencedActionUpdate(db, run.id, claimId, {
    action_phase: 'DISPATCH_STARTED',
    dispatch_started_at: now,
  })
  if (started.fenced) {
    return { executed: false, refusal: 'fenced', detail: 'claim rotated before dispatch' }
  }

  let output: EffectHandlerOutput | null = null
  let spendDenied: string | null = null

  const runEffect = async (): Promise<EffectHandlerOutput> => {
    const result = await handler(handlerInput)
    // A positive non-dispatch claim is the ONLY thing that may release a
    // reservation. Raising the canonical error is how that claim reaches
    // `withGovernedSpend`, which releases on it and settles on everything else.
    if (result.provablyNotApplied) {
      output = result
      throw new ProviderNotDispatchedError(result.detail, run.action_kind)
    }
    return result
  }

  try {
    if (requirements.requiresSpendReservation) {
      // Hoisted rather than inlined: the propagation guard scans the boundary's
      // first object literal for `execution`, and a nested `project: { … }`
      // would end its scan before reaching it. Naming the ref keeps the call
      // legible to the guard that is supposed to be reading it.
      const project = { projectId: run.project_id as string }
      // Reserve against the EXACT action identity, so a retry of the same intent
      // cannot take a second reservation and a fresh intent must take its own.
      output = await withGovernedSpend(
        {
          project,
          execution: input.execution,
          provider: 'workflow',
          operation: run.action_kind,
          estimatedSek: 0,
          idempotencyKey: run.idempotency_key ?? undefined,
        },
        runEffect,
      )
    } else {
      output = await runEffect()
    }
  } catch (e) {
    if (e instanceof ProviderNotDispatchedError) {
      // Released, and provably nothing happened. `output` was captured above.
    } else if (e instanceof SpendDeniedError) {
      spendDenied = e.message
    } else if (e && typeof e === 'object' && (e as { name?: string }).name === 'SpendRefusedError') {
      spendDenied = (e as Error).message
    } else {
      // The handler threw without a positive claim. That is ambiguity, not
      // failure: the effect may already have happened, and only reconciliation
      // may say otherwise.
      output = {
        observation: 'response_lost',
        provablyNotApplied: false,
        remoteOperationId: null,
        detail: e instanceof Error ? e.message : 'the effect did not complete',
      }
    }
  }

  if (spendDenied !== null) {
    // Refused BEFORE any dispatch, so nothing happened and nothing is owed.
    await fencedActionUpdate(db, run.id, claimId, {
      action_phase: 'DISPATCH_STARTED',
      action_outcome: 'FAILED',
      reconciliation_required: false,
    })
    return { executed: false, refusal: 'spend_refused', detail: spendDenied,
             outcome: 'FAILED', disposition: 'temporary' }
  }

  const observed = output as EffectHandlerOutput
  const outcome = outcomeForObservation(observed.observation, 'DISPATCH_STARTED')
  const reconciliationRequired = outcome === 'UNKNOWN' || outcome === 'PARTIAL'

  await fencedActionUpdate(db, run.id, claimId, {
    action_phase: 'REMOTE_CONFIRMED',
    remote_confirmed_at: now,
    action_outcome: outcome,
    reconciliation_required: reconciliationRequired,
    remote_operation_id: observed.remoteOperationId,
  })

  // ── Evidence, gated ────────────────────────────────────────────────────────
  // Success is refused while anything is unresolved. An outcome needing
  // reconciliation is an open question, not an unconfirmed success, and writing
  // success against it would tell the workflow the world is in a state nobody
  // has verified.
  const maySucceed = mayRecordSuccessEvidence({
    outcome,
    reconciliationRequired,
    // Spend is settled by `withGovernedSpend` before it returns; reaching here
    // without a denial means the reservation is resolved.
    spendSettled: true,
    requiresSpend: requirements.requiresSpendReservation,
  })

  const retry = decideRetry(canonical.action_class, outcome, run.attempts ?? 1)

  return {
    executed: true,
    outcome,
    phase: 'REMOTE_CONFIRMED',
    detail: `${observed.detail} (retry=${retry.retry}, reconcile=${reconciliationRequired})`,
    ...(observed.checkKey ? {
      evidence: {
        checkKey: observed.checkKey,
        // Success is refused while anything is unresolved; the check still gets
        // an honest row saying so.
        result: maySucceed ? ('pass' as const) : ('fail' as const),
        expected: 'a governed effect completed with certainty sufficient for success',
        observed: observed.detail,
        detail: {
          ...(observed.evidenceDetail ?? {}),
          outcome,
          reconciliation_required: reconciliationRequired,
          run_id: run.id,
        },
      },
    } : {}),
  }
}
