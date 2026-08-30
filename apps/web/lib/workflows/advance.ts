/**
 * lib/workflows/advance.ts — executing a human's decision to cross a gate.
 *
 * ── WHY THIS IS NOT "AUTONOMY" ──────────────────────────────────────────────
 * Until now nothing in the application called `appendTransition`; the tick
 * stopped at `authorized_ready` with the comment "needs a later PR to act". This
 * is that PR, and the distinction it rests on is narrow but real:
 *
 *   the scheduler deciding to move a workflow          → autonomy, forbidden
 *   the scheduler carrying out a move a human granted  → executing a decision
 *
 * A `workflow_gate` grant is not a general permission. It pins ONE instance, ONE
 * state, ONE from→to move and the exact evidence set that existed when it was
 * requested. The moment the state changes, the grant's `target_id`
 * (`instance:state`) no longer matches, so it cannot be spent twice and it can
 * never authorize the next gate. "Exactly one transition per grant" is therefore
 * structural, not a rule someone has to remember.
 *
 * ── EVERY CHECK IS RE-DERIVED, AND SQL CHECKS AGAIN ─────────────────────────
 * Nothing here trusts the tick's earlier evaluation. The gate is re-derived from
 * the ledger, required evidence is re-summarised, and `workflow_append_transition`
 * independently re-validates the grant inside the database — chain exists, is a
 * workflow_gate, names this instance and state, right project, unexpired,
 * granted, no closing act. `granted_with_conditions` is not sufficient in either
 * layer.
 */

import 'server-only'

import { getState } from './machine'
import { appendTransition, listEvidence, readDefinitionById } from './store'
import { systemAuthorizationVerifier, systemDeriveWorkflowGate } from './system-authorization'
import { summarizeStateEvidence } from './evidence-consumption'
import { findAdapter } from './adapters/registry'
import type { WorkflowInstance } from './types'
import type { LedgerReader } from './system-authorization'

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

export type AdvanceOutcome =
  | 'advanced'
  /** No gate on this state — not this module's business. */
  | 'not_gated'
  /** No live grant pinning this exact instance+state+target. */
  | 'not_authorized'
  /** A declared REQUIRED check is not satisfied. The grant does not override evidence. */
  | 'evidence_incomplete'
  /** The definition declares no successor — a terminal state. */
  | 'no_successor'
  | 'project_paused'
  | 'instance_not_active'
  | 'append_refused'

export interface AdvanceResult {
  outcome: AdvanceOutcome
  fromState: string
  toState: string | null
  authorizationId: string | null
  detail: string
}

/**
 * Advance one instance across its gate, if and only if a human already granted
 * exactly that move.
 *
 * Returns without writing for every non-`advanced` outcome. There is no force
 * flag and no way to supply a gate status, an authorization id or a target hash
 * from outside — all three are derived here.
 */
export async function advanceAuthorizedWorkflow(
  db: AnyDb, instance: WorkflowInstance,
  options: { now?: string; ledger?: LedgerReader } = {},
): Promise<AdvanceResult> {
  const now = options.now ?? new Date().toISOString()
  const from = instance.current_state
  const base = { fromState: from, toState: null, authorizationId: null }

  if (instance.status !== 'active') {
    return { ...base, outcome: 'instance_not_active', detail: `instance is ${instance.status}` }
  }

  const { data: project } = await db.from('projects')
    .select('execution_paused').eq('id', instance.project_id).maybeSingle()
  if (project?.execution_paused === true) {
    return { ...base, outcome: 'project_paused', detail: 'project execution is paused' }
  }

  const def = await readDefinitionById(db, instance.def_id)
  const state = getState(def.spec, from)
  if (!state) {
    return { ...base, outcome: 'append_refused', detail: `state "${from}" is not in the pinned definition` }
  }
  if (state.human_gate.required !== true) {
    // An ungated state is the scheduler's existing auto-advance question, not
    // this module's. Deliberately left alone.
    return { ...base, outcome: 'not_gated', detail: `"${from}" declares no human gate` }
  }
  if (!state.next_state) {
    return { ...base, outcome: 'no_successor', detail: `"${from}" is terminal` }
  }

  // Re-derived from the ledger — never taken from the tick's earlier evaluation.
  const gate = await systemDeriveWorkflowGate(db, instance.id, { now, ledger: options.ledger })
  if (!gate.canAdvance || gate.status !== 'authorized' || !gate.authorizationId) {
    return {
      ...base, toState: state.next_state, authorizationId: gate.authorizationId ?? null,
      outcome: 'not_authorized', detail: `gate is ${gate.status}`,
    }
  }

  // A grant does not override evidence. If the definition marks a check required
  // for this state and it is not satisfied, the move does not happen — the human
  // authorized crossing the gate, not skipping the work.
  const adapter = findAdapter(instance.def_key)
  if (adapter) {
    const declared = adapter.attestableChecks()
    const required = declared.filter(c => c.state === from && c.required).map(c => c.check_key)
    if (required.length > 0) {
      const rows = await listEvidence(db, instance.id)
      const summary = summarizeStateEvidence(declared, from, rows, () => gate.target?.versionHash ?? '')
      const unmet = summary.verdicts.filter(v => required.includes(v.check_key) && !v.satisfies)
      if (unmet.length > 0) {
        return {
          ...base, toState: state.next_state, authorizationId: gate.authorizationId,
          outcome: 'evidence_incomplete',
          detail: `${unmet.length} required check(s) unsatisfied: ${unmet.map(u => u.check_key).join(', ')}`,
        }
      }
    }
  }

  // The append. SQL re-validates the grant independently; if it disagrees with
  // anything derived above, the transition is refused there rather than here.
  try {
    await appendTransition(db, {
      instanceId: instance.id,
      to: state.next_state,
      reason: `human gate satisfied: ${state.human_gate.decision ?? 'authorized'}`,
      actor: 'omnira.workflow.scheduler',
      authorizationId: gate.authorizationId,
      // The tick has no session, so the DEFAULT principal-scoped verifier would
      // fail closed and refuse a legitimately authorized move. The system
      // verifier reads the same ledger read-only and additionally requires the
      // grant opening this gate to be the one cited.
      verifyAuthorization: systemAuthorizationVerifier,
    })
  } catch (e) {
    return {
      ...base, toState: state.next_state, authorizationId: gate.authorizationId,
      outcome: 'append_refused', detail: e instanceof Error ? e.message : 'append failed',
    }
  }

  return {
    outcome: 'advanced', fromState: from, toState: state.next_state,
    authorizationId: gate.authorizationId,
    detail: `${from} → ${state.next_state} on authorization ${gate.authorizationId.slice(0, 8)}…`,
  }
}
