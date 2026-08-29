/**
 * lib/workflows/tick.ts — the scheduled continuation loop.
 *
 * Claims due instances, evaluates each, records what it found, and sets the next
 * wake. In PR3 it does not advance anything: `evaluateWorkflowTick` classifies
 * the state, and for every state in the shipped definition the honest answer is
 * that the work is external. See schedule.ts for why that classification is
 * derived rather than declared.
 *
 * SAFETY PROPERTIES, and where each comes from:
 *
 *   no double-advance   the claim uses SKIP LOCKED and pushes wake_at forward,
 *                       so two concurrent ticks cannot hold the same instance
 *   no lost wake        a crash leaves wake_at a few minutes out; the instance
 *                       becomes due again and is retried
 *   idempotent          evaluation is pure and re-derived from history every
 *                       time; recording is a no-op for the audit log unless the
 *                       outcome actually changed
 *   no zombie           there is no lease and no reaper to get stuck; the only
 *                       durable state is a timestamp
 *   gate-safe           the gate verdict comes from the read-only system
 *                       verifier, which cannot author or grant authority
 *
 * One failing instance never stops the batch — each is evaluated in isolation
 * and its failure is recorded against that instance.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  claimDueWorkflowInstances,
  listTransitions,
  readDefinitionById,
  recordWorkflowTick,
  type WorkflowDb,
} from './store'
import { systemDeriveWorkflowGate, type LedgerReader } from './system-authorization'
import {
  evaluateWorkflowTick,
  nextWakeAfter,
  type WorkflowTickEvaluation,
} from './schedule'
import type { WorkflowInstance } from './types'

export interface TickOptions {
  now?: string
  limit?: number
  visibilitySeconds?: number
  ledger?: LedgerReader
  /** Injected so tests can assert escalation without writing signals. */
  emitSignal?: (kind: string, payload: Record<string, unknown>) => Promise<void>
}

export interface TickResult {
  claimed: number
  evaluated: { instanceId: string; instanceKey: string; outcome: string; reason: string }[]
  escalated: number
  errors: { instanceId: string; error: string }[]
}

/**
 * Evaluate one instance. Pure decision, I/O only to gather inputs.
 *
 * The project's paused flag is read here as well as filtered inside the claim:
 * the claim keeps paused work out of a batch, and this keeps a direct call
 * honest.
 */
export async function evaluateDueWorkflow(
  db: WorkflowDb,
  instance: WorkflowInstance,
  options: { now?: string; ledger?: LedgerReader } = {},
): Promise<WorkflowTickEvaluation> {
  const now = options.now ?? new Date().toISOString()

  const def = await readDefinitionById(db, instance.def_id)
  const transitions = await listTransitions(db, instance.id)

  const { data: project } = await (db as { from: (t: string) => any })
    .from('projects').select('execution_paused').eq('id', instance.project_id).maybeSingle()
  const projectPaused = project?.execution_paused === true

  // Resolving the gate costs a ledger read; skip it where the definition says
  // there is no gate to resolve.
  const state = def.spec.states.find(s => s.id === instance.current_state) ?? null
  const gate = state?.human_gate.required === true
    ? await systemDeriveWorkflowGate(db, instance.id, { now, ledger: options.ledger })
    : null

  return evaluateWorkflowTick({
    instance, spec: def.spec, transitions, gate, projectPaused, now,
  })
}

/** Append an escalation signal. Best-effort: never fails the tick. */
async function defaultEmitSignal(kind: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const db = createAdminClient() as unknown as { from: (t: string) => any }
    await db.from('atlas_signals').insert({ kind, payload, version: 'workflow-tick-v1' })
  } catch (e) {
    console.error('[workflow-tick] signal emit failed:', e)
  }
}

/**
 * One pass of the scheduler.
 *
 * Returns a summary rather than throwing: the caller is a cron endpoint, and a
 * single bad instance must not look like a dead scheduler.
 */
export async function tickDueWorkflows(
  db: WorkflowDb,
  options: TickOptions = {},
): Promise<TickResult> {
  const now = options.now ?? new Date().toISOString()
  const emit = options.emitSignal ?? defaultEmitSignal

  const claimed = await claimDueWorkflowInstances(
    db, options.limit ?? 20, options.visibilitySeconds ?? 300,
  )

  const result: TickResult = { claimed: claimed.length, evaluated: [], escalated: 0, errors: [] }

  for (const instance of claimed) {
    try {
      const evaluation = await evaluateDueWorkflow(db, instance, { now, ledger: options.ledger })

      const seconds = nextWakeAfter(evaluation.outcome)
      const nextWakeAt = seconds === null
        ? null
        : new Date(Date.parse(now) + seconds * 1000).toISOString()

      await recordWorkflowTick(db, instance.id, evaluation.outcome, {
        reason: evaluation.reason,
        state: evaluation.state,
        gate_status: evaluation.gateStatus,
        missing_prerequisites: evaluation.missingPrerequisites,
        auto_advanceable: evaluation.autoAdvanceable,
      }, nextWakeAt)

      if (evaluation.escalate) {
        result.escalated += 1
        await emit('workflow.integrity_failure', {
          instance_id: instance.id,
          instance_key: instance.instance_key,
          def_key: instance.def_key,
          state: evaluation.state,
          reason: evaluation.reason,
          severity: 'critical',
        })
      }

      result.evaluated.push({
        instanceId: instance.id,
        instanceKey: instance.instance_key,
        outcome: evaluation.outcome,
        reason: evaluation.reason,
      })
    } catch (e) {
      // The instance keeps its pushed-forward wake_at, so it is retried on a
      // later tick rather than being dropped.
      const message = e instanceof Error ? e.message : 'unknown error'
      console.error(`[workflow-tick] ${instance.id} evaluation failed:`, message)
      result.errors.push({ instanceId: instance.id, error: message })
    }
  }

  return result
}
