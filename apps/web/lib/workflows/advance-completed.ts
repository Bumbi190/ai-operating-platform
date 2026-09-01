/**
 * lib/workflows/advance-completed.ts — crossing a state whose work is finished.
 *
 * ── THE SIBLING, NOT THE MERGER ────────────────────────────────────────────
 * `advanceAuthorizedWorkflow` carries out a decision a human already made. This
 * module carries out something different: a state with NO human gate, whose
 * declared work is provably complete, moving to its declared successor. The two
 * are deliberately separate modules that refuse each other's states —
 * `advanceAuthorizedWorkflow` returns `not_gated` for an ungated state, and this
 * one returns `human_gate_present` for a gated one. Merging them would put the
 * single question that must never blur — "does a human have to say yes?" — into
 * one predicate that a bug could get wrong in the permissive direction.
 *
 * ── COMPLETION AUTHORITY IS NOT EXECUTION AUTHORITY ────────────────────────
 * This module may conclude "this state is complete". It may NEVER conclude
 * "perform this state's work". It creates no runs, calls no providers, and
 * reads `automated_actions` never — those are Swedish sentences, and
 * `action-discovery.ts` already explains what happens when prose is treated as
 * executable. `edge_deploy` is the reason this paragraph exists: it is ungated
 * and its prose describes deploying two production functions. Nothing here can
 * deploy anything; the most it can do is decline to advance.
 *
 * ── WHY VERIFICATION IS NOT RE-RUN HERE ────────────────────────────────────
 * Every other input is re-derived from the database, and none of that has a
 * side effect. `adapter.verifyState` does: for Familje-Stunden it makes live
 * HTTP probes. Re-running it inside an advance decision would mean *deciding*
 * costs outbound requests, and would double every probe the tick already made.
 * So verification arrives as findings that can ONLY refuse — they are never
 * consulted to permit anything, and passing an empty list grants nothing. The
 * tick's own `applyVerification` already blocks before delegating here, so this
 * is a second refusal, not the only one.
 */

import 'server-only'

import { checkPrerequisites, deriveCurrentState, getState } from './machine'
import { appendTransition, listEvidence, listTransitions, readDefinitionById } from './store'
import { summarizeStateEvidence } from './evidence-consumption'
import { evidenceTargetHashFor } from './evidence-binding'
import { registeredActionsAt } from './action-discovery'
import { classifyPriorObservation, type PriorObservation } from './action-identity'
import { findAdapter } from './adapters/registry'
import type { WorkflowInstance } from './types'

// any: the Supabase client in this project has no generated DB types.
type AnyDb = any

export type CompletionRefusal =
  | 'inactive_instance'
  | 'project_paused'
  | 'state_not_in_definition'
  | 'terminal_state'
  /** A human gate lives here. `advanceAuthorizedWorkflow` owns this state. */
  | 'human_gate_present'
  | 'prerequisites_unmet'
  /**
   * The state declares work but no required check. "All required checks
   * satisfied" would be VACUOUSLY TRUE, which is how `scheduled_release` —
   * whose declared work is "wait until the release instant" — would otherwise
   * advance immediately, past the release. A state that cannot describe its own
   * completion is never complete.
   */
  | 'no_completion_criteria'
  | 'required_evidence_incomplete'
  | 'required_evidence_blocked'
  | 'required_evidence_failed'
  | 'action_failed_without_satisfying_evidence'
  | 'action_still_active'
  | 'ambiguity_reconciliation_required'
  | 'adapter_verification_blocked'
  | 'append_refused'

export type CompletionOutcome = 'advanced' | CompletionRefusal

export interface CompletionResult {
  outcome: CompletionOutcome
  fromState: string
  toState: string | null
  /** Bounded, closed vocabulary. Null only when the state advanced. */
  reasonCode: CompletionRefusal | null
  /** Declared check keys that held the state back. Catalogue keys only. */
  blockingCheckKeys: readonly string[]
  detail: string
}

const MAX_BLOCKING_KEYS = 10

/** Satisfactions that mean "a producer reported a real negative finding". */
const FAILED_SATISFACTIONS = ['failed']
/** Satisfactions that mean "we could not obtain a usable answer". */
const BLOCKED_SATISFACTIONS = ['blocked', 'errored']

/**
 * Advance one ungated, work-bearing state whose work is complete.
 *
 * Every input is re-derived here. The caller may not supply a gate status, an
 * evidence verdict, a completion flag, a successor or an authorization — there
 * is no parameter for any of them. `verificationFindings` is the single caller
 * input and it can only ever cause a refusal.
 */
export async function advanceCompletedWorkflowState(
  db: AnyDb,
  instance: WorkflowInstance,
  options: { now?: string; verificationFindings?: readonly string[] } = {},
): Promise<CompletionResult> {
  const from = instance.current_state
  const base = { fromState: from, toState: null as string | null, blockingCheckKeys: [] as string[] }
  const refuse = (
    reasonCode: CompletionRefusal, detail: string,
    extra: { toState?: string | null; blockingCheckKeys?: string[] } = {},
  ): CompletionResult => ({
    ...base, ...extra, outcome: reasonCode, reasonCode, detail,
    blockingCheckKeys: (extra.blockingCheckKeys ?? []).slice(0, MAX_BLOCKING_KEYS),
  })

  // 1) The instance must be live.
  if (instance.status !== 'active') {
    return refuse('inactive_instance', `instance is ${instance.status}`)
  }

  // 2) A paused project accumulates no progress, not even orchestration.
  const { data: project } = await db.from('projects')
    .select('execution_paused').eq('id', instance.project_id).maybeSingle()
  if (project?.execution_paused === true) {
    return refuse('project_paused', 'project execution is paused')
  }

  const def = await readDefinitionById(db, instance.def_id)
  const state = getState(def.spec, from)
  if (!state) {
    return refuse('state_not_in_definition', `"${from}" is not in the pinned definition`)
  }

  // 3/4) Terminal states go nowhere, and a gated state belongs to the other
  //      module. Checked before any evidence work: no amount of completion may
  //      substitute for a human decision.
  if (!state.next_state) return refuse('terminal_state', `"${from}" is terminal`)
  if (state.human_gate.required === true) {
    return refuse('human_gate_present',
      `"${from}" requires ${state.human_gate.approver ?? 'human'} authorization`,
      { toState: state.next_state })
  }
  const to = state.next_state

  // 5) Prerequisites judged against the world this advance would create —
  //    the same construction the tick uses, re-derived from stored history.
  const transitions = await listTransitions(db, instance.id)
  const derived = deriveCurrentState(def.spec, transitions)
  if (derived.current_state !== from) {
    return refuse('state_not_in_definition',
      `projection drift: stored "${from}", derived "${derived.current_state}"`, { toState: to })
  }
  const completedAfter = new Set(derived.completed)
  completedAfter.add(from)
  completedAfter.delete(to)
  const prereq = checkPrerequisites(def.spec, to, completedAfter)
  if (!prereq.satisfied) {
    return refuse('prerequisites_unmet',
      `"${to}" requires ${prereq.missing.map(m => `"${m}"`).join(', ')} first`, { toState: to })
  }

  // 6) The state must be able to say what "complete" means for it.
  const adapter = findAdapter(instance.def_key)
  const declared = adapter?.attestableChecks() ?? []
  const requiredKeys = declared
    .filter(c => c.state === from && c.required).map(c => c.check_key).sort()
  if (requiredKeys.length === 0) {
    return refuse('no_completion_criteria',
      `"${from}" declares work but no required check; completion cannot be established`,
      { toState: to })
  }

  // 7) Declared work must be finished. The lifecycle question is PR9h-4's and is
  //    answered by its classifier — there is no second lifecycle model here.
  //    `null` is passed for the schedule because this is not asking whether a
  //    fresh observation may be scheduled; a terminal run reports
  //    `awaiting_explicit_schedule`, which is exactly "terminal, nothing
  //    pending", and that does not block completion.
  const holdBlocks: Record<string, CompletionRefusal> = {
    active_run_exists: 'action_still_active',
    attempt_budget_spent: 'action_still_active',
    ambiguity_reconciliation_required: 'ambiguity_reconciliation_required',
    unclassified_prior_run: 'ambiguity_reconciliation_required',
  }
  let sawTerminalFailure = false
  for (const actionKind of registeredActionsAt(instance.def_key, from)) {
    const { data: rows } = await db.from('runs')
      .select('id, status, attempts, max_attempts, created_at, action_outcome, reconciliation_required')
      .eq('workflow_instance_id', instance.id)
      .eq('action_kind', actionKind)
      .eq('workflow_from_state', from)
      .not('status', 'in', '("cancelled","rejected")')
      .order('created_at', { ascending: false }).limit(1)
    const prior = (rows ?? [])[0] as PriorObservation | undefined
    // No run at all is NOT a block. Required evidence is checked below and is
    // the authority: if the check is satisfied, bound and current, the
    // observation exists — attested by a permitted producer if not run here.
    // Blocking would deadlock every state whose evidence is attested.
    if (!prior) continue
    const disposition = classifyPriorObservation(prior, null)
    if (disposition.holds && holdBlocks[disposition.reason]) {
      return refuse(holdBlocks[disposition.reason], disposition.detail, { toState: to })
    }
    if (prior.action_outcome && prior.action_outcome !== 'SUCCEEDED') sawTerminalFailure = true
  }

  // 8) Live verification may only ever refuse. See the header for why it is not
  //    re-run here. An empty list permits nothing on its own.
  const findings = options.verificationFindings ?? []
  if (findings.length > 0) {
    return refuse('adapter_verification_blocked',
      `verification: ${findings.slice(0, MAX_BLOCKING_KEYS).join(', ')}`, { toState: to })
  }

  // 9) Required evidence, under the canonical evaluator and the shared pin.
  //    Binding, provenance and result are all decided inside `evaluateCheck`;
  //    nothing is re-implemented here and no raw column is read.
  const rows = await listEvidence(db, instance.id)
  const summary = summarizeStateEvidence(
    declared, from, rows, evidenceTargetHashFor(instance, def.spec, from, rows))
  const unmet = summary.verdicts.filter(v => requiredKeys.includes(v.check_key) && !v.satisfies)
  if (unmet.length > 0) {
    const keys = unmet.map(v => v.check_key).sort()
    const worst = unmet.map(v => v.satisfaction)
    const reason: CompletionRefusal =
      sawTerminalFailure                                        ? 'action_failed_without_satisfying_evidence'
      : worst.some(s => FAILED_SATISFACTIONS.includes(s))       ? 'required_evidence_failed'
      : worst.some(s => BLOCKED_SATISFACTIONS.includes(s))      ? 'required_evidence_blocked'
      :                                                           'required_evidence_incomplete'
    return refuse(reason,
      `${keys.length} required check(s) unsatisfied: ${unmet.map(v => `${v.check_key}:${v.satisfaction}`).join(', ')}`,
      { toState: to, blockingCheckKeys: keys })
  }

  // 10) The append. `authorizationId` is null and that is the POINT: the
  //     definition plus completed, verified work is the authority, and no human
  //     decision is invented to stand in for it. The SQL demands an
  //     authorization only when the from-state is gated, which this one is not,
  //     so a null here is accepted by design rather than by exception. The RPC
  //     takes the instance row FOR UPDATE and compares stored current_state to
  //     the from-state, so two concurrent advances cannot both append.
  try {
    await appendTransition(db, {
      instanceId: instance.id,
      to,
      reason: `automated completion: "${from}" work complete and verified`,
      actor: 'omnira.workflow.scheduler',
      authorizationId: null,
    })
  } catch (e) {
    return refuse('append_refused', e instanceof Error ? e.message : 'append failed', { toState: to })
  }

  return {
    outcome: 'advanced', fromState: from, toState: to, reasonCode: null,
    blockingCheckKeys: [],
    detail: `${from} → ${to} on ${requiredKeys.length} satisfied required check(s)`,
  }
}
