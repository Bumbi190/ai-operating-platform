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

import {
  claimDueWorkflowInstances,
  listEvidence,
  listTransitions,
  readDefinitionById,
  recordWorkflowTick,
  type WorkflowDb,
} from './store'
import { advanceAuthorizedWorkflow, type AdvanceResult } from './advance'
import { ensureReadOnlyActionRuns, type SchedulingDecision } from './action-scheduling'
import { computeEvidenceTargetHash } from './attestation'
import { summarizeStateEvidence } from './evidence-consumption'
import {
  decideNotification, escalationEmail, listActiveWorkflowSignals,
  raiseWorkflowSignal, resolveWorkflowSignal, type SignalWriter,
} from './escalation'
import { sendAdminNotification } from '@/lib/email/brevo'
import { systemDeriveWorkflowGate, type LedgerReader } from './system-authorization'
import { findAdapter } from './adapters/registry'
import type { VerificationEvidence } from './adapters/types'
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
  /**
   * The Signal Platform write path. Production uses `recordSignal`, which builds
   * its own admin client; tests inject one so the escalation lifecycle can be
   * observed without a database.
   */
  signalWriter?: SignalWriter
}

export interface TickResult {
  claimed: number
  evaluated: { instanceId: string; instanceKey: string; outcome: string; reason: string }[]
  /** Conditions newly raised or regressed this tick. Repeats are not counted. */
  escalated: number
  /** Conditions that recovered this tick. */
  resolved: number
  /** Operator emails sent. Zero unless WORKFLOW_ESCALATION_EMAIL=1. */
  notified: number
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

  // Read-only verification, when an adapter serves this definition and has
  // something to say about this state. It reaches only the project's own
  // authoritative systems, never writes, and can only downgrade the outcome.
  let verification: VerificationEvidence[] = []
  const adapter = findAdapter(instance.def_key)
  if (adapter) {
    try {
      verification = await adapter.verifyState({
        state: instance.current_state, instanceKey: instance.instance_key, now,
      })
    } catch (e) {
      // A throwing adapter is an unusable answer, never a passing one.
      verification = [{
        check_key: 'adapter_execution', result: 'error', observed_at: now,
        source: 'omnira.workflow.adapter', authoritative_system: adapter.authoritativeSystem,
        expected: 'adapter verification to complete',
        observed: e instanceof Error ? e.message : 'unknown error',
        failure_kind: 'unexpected_status', detail: {},
      }]
    }
  }

  // Recorded evidence (PR5) for the checks this state declares, judged against
  // the CURRENT target. Stale, refused and absent all resolve here, not later.
  let evidence: Awaited<ReturnType<typeof summarizeStateEvidence>>['verdicts'] = []
  let requiredChecks = new Set<string>()
  if (adapter) {
    try {
      const rows = await listEvidence(db, instance.id)
      const declared = adapter.attestableChecks().filter(c => c.state === instance.current_state)
      requiredChecks = new Set(declared.filter(c => c.required).map(c => c.check_key))
      evidence = summarizeStateEvidence(
        adapter.attestableChecks(), instance.current_state, rows,
        checkKey => {
          const row = rows.find(r => r.check_key === checkKey)
          const meta = (row?.attestation ?? {}) as
            { source_commit?: string; artifact_manifest_hash?: string }
          return computeEvidenceTargetHash({
            instance, spec: def.spec, state: instance.current_state, checkKey,
            sourceCommit: meta.source_commit ?? null,
            artifactManifestHash: meta.artifact_manifest_hash ?? null,
          })
        },
      ).verdicts
    } catch (e) {
      // Unreadable evidence is never "nothing is wrong". Surface it as a
      // condition rather than evaluating as if the checks did not exist.
      console.error(`[workflow-tick] ${instance.id} evidence read failed:`, e)
      evidence = []
      requiredChecks = new Set()
    }
  }

  return evaluateWorkflowTick({
    instance, spec: def.spec, transitions, gate, projectPaused, now,
    verification, evidence, requiredChecks,
  })
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

  const claimed = await claimDueWorkflowInstances(
    db, options.limit ?? 20, options.visibilitySeconds ?? 300,
  )

  const result: TickResult = {
    claimed: claimed.length, evaluated: [], escalated: 0, resolved: 0, notified: 0, errors: [],
  }

  for (const instance of claimed) {
    try {
      const evaluation = await evaluateDueWorkflow(db, instance, { now, ledger: options.ledger })

      // ── PR9f: the READ_ONLY seam ──────────────────────────────────────────
      // Create bound observation runs for this state's canonical READ_ONLY
      // actions. The tick NEVER calls a handler: it creates a run and the drain
      // executes it later, so the observation is claimed, fenced, cancellable
      // and reapable like any other work. It performs no transition and takes
      // no authorization — READ_ONLY needs none, and any other class would be
      // refused three layers down.
      let scheduled: SchedulingDecision[] = []
      try {
        // Pause and instance-status guards live inside the seam, so a future
        // caller cannot forget them.
        scheduled = await ensureReadOnlyActionRuns(db, instance)
      } catch (e) {
        // A seam failure must not look like a dead scheduler, and must never be
        // mistaken for "nothing needed scheduling".
        result.errors.push({
          instanceId: instance.id,
          error: `action scheduling failed: ${e instanceof Error ? e.message : 'unknown error'}`,
        })
      }
      const createdAction = scheduled.some(d => d.outcome === 'created')

      // ── PR9g: carry out a human's decision to cross a gate ────────────────
      // Only when the gate DERIVES `authorized` from the ledger. The grant pins
      // one instance, one state and one from→to move, and its target_id stops
      // matching the moment the state changes — so it can be spent exactly once
      // and can never authorize the next gate. Everything is re-derived inside
      // advanceAuthorizedWorkflow, and workflow_append_transition re-validates
      // the grant again in SQL.
      let advance: AdvanceResult | null = null
      if (evaluation.outcome === 'authorized_ready' || evaluation.outcome === 'ready_for_transition') {
        try {
          advance = await advanceAuthorizedWorkflow(db, instance, { now, ledger: options.ledger })
        } catch (e) {
          result.errors.push({
            instanceId: instance.id,
            error: `gate advance failed: ${e instanceof Error ? e.message : 'unknown error'}`,
          })
        }
      }

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
        verification: evaluation.verification,
        verification_findings: evaluation.verificationFindings,
        scheduled_actions: scheduled.map(d => ({ kind: d.actionKind, outcome: d.outcome })),
        gate_advance: advance
          ? { outcome: advance.outcome, from: advance.fromState, to: advance.toState }
          : null,
      // Having just created an observation, do NOT come back in a minute to
      // find it still running. The executor re-arms the instance when the run
      // finishes, which is both sooner and more accurate than polling.
      // A completed advance re-evaluates immediately: the instance is in a new
      // state whose gate, prerequisites and evidence are all different, and the
      // operator should see that reflected without waiting out a backoff.
      }, createdAction ? null : advance?.outcome === 'advanced' ? now : nextWakeAt)

      // ── Escalation ───────────────────────────────────────────────────────
      // Each condition becomes at most one OPEN signal. A repeated identical
      // detection appends nothing, which is what keeps a once-a-minute tick
      // from writing a once-a-minute incident log.
      const openBefore = await listActiveWorkflowSignals(instance.project_id, db)
      const stillOpen = new Set<string>()

      for (const condition of evaluation.conditions) {
        const raised = await raiseWorkflowSignal({
          projectId: instance.project_id,
          instanceId: instance.id,
          instanceKey: instance.instance_key,
          defKey: instance.def_key,
          defVersion: instance.def_version,
          defHash: instance.def_hash,
          state: evaluation.state ?? instance.current_state,
          failureClass: condition.failureClass,
          checkKey: condition.checkKey,
          targetHash: condition.targetHash,
          provenance: condition.provenance,
          summary: condition.summary,
          observedAt: now,
        }, db, options.signalWriter)
        stillOpen.add(raised.signalKey)
        if (raised.outcome !== 'unchanged') result.escalated += 1

        // Email is default-off and only ever on a lifecycle CHANGE, so a
        // repeated detection cannot notify at all. Best-effort: a mail failure
        // must never fail a tick or lose the signal that was already recorded.
        const decision = decideNotification({
          severity: raised.severity, outcome: raised.outcome, now,
          previousEventAt: openBefore.find(o => o.signalKey === raised.signalKey)?.producedAt ?? null,
        })
        if (decision.notify && raised.signal) {
          result.notified += 1
          try {
            const { subject, html } = escalationEmail(raised.signal.payload)
            await sendAdminNotification(subject, html)
          } catch (mailErr) {
            console.error('[workflow-tick] escalation email failed:', mailErr)
          }
        }
      }

      // Anything open for THIS instance that the current evaluation no longer
      // finds has recovered. The original event is never edited or deleted — a
      // `resolved` event is appended beside it, so the history stays readable.
      for (const open of openBefore) {
        if (open.payload.instance_id !== instance.id) continue
        if (stillOpen.has(open.signalKey)) continue
        await resolveWorkflowSignal({
          projectId: instance.project_id,
          signalKey: open.signalKey,
          summary: 'condition no longer present in the current evaluation',
          observedAt: now,
        }, db, options.signalWriter)
        result.resolved += 1
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
      // The instance keeps its pushed-forward wake and is retried; a repeated
      // failure escalates once rather than every minute.
      try {
        await raiseWorkflowSignal({
          projectId: instance.project_id, instanceId: instance.id,
          instanceKey: instance.instance_key, defKey: instance.def_key,
          defVersion: instance.def_version, defHash: instance.def_hash,
          state: instance.current_state, failureClass: 'scheduler_error',
          summary: `tick evaluation failed: ${message.slice(0, 300)}`, observedAt: now,
        }, db, options.signalWriter)
      } catch (signalErr) {
        console.error('[workflow-tick] escalation failed:', signalErr)
      }
    }
  }

  return result
}
