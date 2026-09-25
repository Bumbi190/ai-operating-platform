/**
 * lib/atlas/autonomy-license/resolve.ts — the canonical autonomy-licence read.
 *
 * Answers §18.275's question — "What may this workflow do, for which project,
 * for how long, who approved it, what stops it?" — for one workflow instance at
 * one read clock.
 *
 * ── WHY THIS IS NOT A PRINCIPAL-SCOPED READ ────────────────────────────────
 * The Decision Ledger's read boundary (`principal-read.ts`) resolves the caller's
 * project membership and denies when the decision sits outside it. That is right
 * for a surface a project member uses, and wrong here: Ruling 1 makes the
 * platform operator the issuing authority precisely BECAUSE project ownership
 * proves authority over one project and not authority to grant Chapter 18
 * autonomy. An operator need not be a member of the project whose licence they
 * are resolving, so a membership check would deny the one caller the ruling
 * authorizes while proving nothing extra about anyone else.
 *
 * Nothing is weakened by this. The DECISION's status is still proven from its
 * immutable lineage by the Chapter 11 pure core — the same function the
 * principal-scoped reader calls — and the licence's own events are read from a
 * SERVER_ONLY table no client role can reach. What is absent is a membership
 * check that was never the basis of this authority.
 *
 * ── INEFFECTIVENESS IS DERIVED, NEVER WRITTEN ──────────────────────────────
 * Ruling 2: "Do NOT mutate the licence ledger when this happens… No background
 * synchronization job." Every way a licence can stop being effective is computed
 * here from (events, registry, decision lineage, read clock). The immutable
 * history keeps saying "this licence was issued under Decision X at time T"
 * while this function says "that decision no longer governs, so it is not
 * currently effective". Those are two different statements and both stay true.
 */

import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { isDecisionGoverning as isGoverningPure } from '@/lib/atlas/decision-ledger/derive'
import { createDecisionLedgerStore } from '@/lib/atlas/decision-ledger/store'
import { readInstance } from '@/lib/workflows/store'

import { deriveLicenseState, effectivenessOf, MalformedLicenseLineageError, resolvedLevelOf } from './derive'
import { scopeDrifted } from './scope'
import { createAutonomyLicenseStore, type AutonomyLicenseStore } from './store'
import { noLicense } from './types'
import type { LicenseEvent, LicenseReason, ResolvedAutonomyLicense } from './types'


/** Statuses that END a lineage, so it cannot compete for current authority. */
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['revoked', 'superseded'])

type LineageSelection =
  | { kind: 'resolved'; lineage: LicenseEvent[] }
  /** Two or more non-terminal lineages: nothing says which one governs. */
  | { kind: 'ambiguous' }
  | { kind: 'none' }
  | { kind: 'malformed' }

/**
 * Which lineage, if any, currently speaks for this instance.
 *
 * ── WHY THIS IS NOT "LATEST EVENT WINS" ────────────────────────────────────
 * An earlier revision picked the lineage whose latest event had the largest
 * `eventSeq`. That is wrong the moment supersession is used:
 *
 *     A  LICENSE_ISSUED        seq 10
 *     B  LICENSE_ISSUED        seq 11
 *     A  LICENSE_SUPERSEDED→B  seq 12     <-- A's lineage now has the newest event
 *
 * Latest-event-wins selects A, which is superseded, so the answer is L0 — while
 * B, the replacement the act explicitly names, is never consulted. The
 * supersession act made the answer worse than not superseding at all.
 *
 * ── THE MODEL ──────────────────────────────────────────────────────────────
 * Terminal lineages (revoked, superseded) do not compete: supersession makes a
 * lineage stop speaking, so its replacement speaks instead. That leaves:
 *
 *   • exactly one live lineage  → resolve it
 *   • more than one             → `ambiguous_licenses`, fail closed to L0
 *   • none                      → resolve the latest terminal one for
 *                                 EXPLANATION only (it will read as revoked or
 *                                 superseded, hence L0), so a caller learns why
 *                                 rather than getting a bare `no_license`
 *
 * The ambiguity case is not a defect to be papered over — it is the correct and
 * expected state *during* a replacement. Issuing B beside a live A is
 * transiently ambiguous until the supersession act lands, and the safe answer
 * in that window is L0, not a guess about which of two live grants the human
 * meant. That is what makes replacement a two-step dance rather than a
 * moment where authority could double.
 *
 * A malformed lineage never competes (one broken chain must not mask a healthy
 * one) but is never silently discarded either: if nothing else is present, the
 * caller is told `malformed_lineage` rather than `no_license`.
 */
function selectCurrentLineage(events: readonly LicenseEvent[]): LineageSelection {
  if (events.length === 0) return { kind: 'none' }

  const byLicense = new Map<string, LicenseEvent[]>()
  for (const event of events) {
    byLicense.set(event.licenseId, [...(byLicense.get(event.licenseId) ?? []), event])
  }

  const derived: { lineage: LicenseEvent[]; status: string; lastSeq: number }[] = []
  let sawMalformed = false
  for (const lineage of byLicense.values()) {
    try {
      const state = deriveLicenseState(lineage)
      derived.push({
        lineage,
        status: state.status,
        lastSeq: Math.max(...lineage.map(e => e.eventSeq)),
      })
    } catch {
      sawMalformed = true
    }
  }

  // ── ANY malformed lineage fails the whole resolution ──────────────────────
  // Checked BEFORE any healthy lineage is considered. A chain that cannot be
  // folded is UNKNOWN authority history, and unknown history must not buy
  // operational freedom: we cannot tell whether it was a competing grant, a
  // replacement, or a terminal act that ended something real. Resolving a
  // healthy sibling beside it would be assuming the missing history was
  // harmless — which is a guess, and this module does not guess about authority.
  if (sawMalformed) return { kind: 'malformed' }

  if (derived.length === 0) return { kind: 'none' }

  const live = derived.filter(d => !TERMINAL_STATUSES.has(d.status))
  if (live.length === 1) return { kind: 'resolved', lineage: live[0].lineage }
  if (live.length > 1) return { kind: 'ambiguous' }

  // Every lineage is terminal. Explain with the most recently appended one.
  const latest = derived.reduce((a, b) => (b.lastSeq > a.lastSeq ? b : a))
  return { kind: 'resolved', lineage: latest.lineage }
}
// ── NO INJECTION SEAM, DELIBERATELY ────────────────────────────────────────
// An earlier revision accepted `ResolveArgs` carrying a store, a workflow
// instance and a decision-lineage loader. Read-only today, but this resolver is
// intended to become an execution-governance truth source, and a production API
// where a future gate could call
//
//     resolveAutonomyLicense(instance, at, { instance: fake, store: fake, … })
//
// and receive a MANUFACTURED effective licence is not one to leave lying around.
// The public resolver reads the real canonical sources; the pure logic it calls
// stays directly testable, and tests mock the imported dependencies instead.

/**
 * The canonical read.
 *
 * `at` is the EVALUATION INSTANT — the moment "is this licence effective?" is
 * asked as of. It is deliberately part of the read contract because an audit
 * must be able to ask the question at a past instant, and because the pure fold
 * takes its clock as a parameter rather than reading a global one.
 *
 * It is NOT an authority input and it does not come from a client: nothing a
 * caller passes here can grant, widen or revive anything. It can only move the
 * question in time, and every answer it produces is a DERIVED ineffectiveness
 * (expiry, not-yet-effective) that fails closed to L0. Future runtime
 * enforcement must pass the server's current instant.
 */



export async function resolveAutonomyLicense(
  workflowInstanceId: string,
  at: string,
): Promise<ResolvedAutonomyLicense> {
  const store = createAutonomyLicenseStore()

  // ── The subject ───────────────────────────────────────────────────────────
  // Read from the real workflow store. A caller names an instance and nothing
  // else; the project and definition it belongs to are facts, not arguments.
  const instance = await readInstance(createAdminClient() as never, workflowInstanceId)
    .then(i => (i ? { project_id: i.project_id, def_key: i.def_key, def_hash: i.def_hash } : null))
    .catch(() => null)

  if (!instance) return noLicense(workflowInstanceId, 'unknown_workflow_instance')

  // ── The licence ───────────────────────────────────────────────────────────
  let events: LicenseEvent[]
  try {
    events = await store.byInstance(workflowInstanceId)
  } catch {
    // A licence read that failed is not "no licence was granted" — it is a
    // failure to prove one. Both resolve to L0, and both say so.
    return { ...noLicense(workflowInstanceId, 'unavailable'), projectId: instance.project_id }
  }

  const selection = selectCurrentLineage(events)
  if (selection.kind === 'none') {
    return { ...noLicense(workflowInstanceId, 'no_license'), projectId: instance.project_id }
  }
  if (selection.kind === 'ambiguous') {
    return { ...noLicense(workflowInstanceId, 'ambiguous_licenses'), projectId: instance.project_id }
  }
  if (selection.kind === 'malformed') {
    return { ...noLicense(workflowInstanceId, 'malformed_lineage'), projectId: instance.project_id }
  }
  const lineage = selection.lineage

  let state
  try {
    state = deriveLicenseState(lineage)
  } catch (error) {
    if (error instanceof MalformedLicenseLineageError) {
      return { ...noLicense(workflowInstanceId, 'malformed_lineage'), projectId: instance.project_id }
    }
    throw error
  }

  // ── The four derived facts a pure fold cannot know ────────────────────────
  //
  // The subject is project-specific (§18.21), so a licence must not outlive its
  // workflow instance's project binding. The database proves this at issue time;
  // re-checking it here matters because "the project moved" is exactly the kind
  // of change that must never be absorbed into a still-effective licence. It
  // should be impossible in normal operation — which is why observing it is
  // treated as a serious fail-closed invariant rather than a curiosity.
  const projectMatches = state.projectId === instance.project_id

  const defHashMatches =
    state.boundDefKey === instance.def_key && state.boundDefHash === instance.def_hash

  const scopeMatches = !scopeDrifted(state.actionKinds, state.boundDefKey, state.recordedFingerprint)

  const decision = await evaluateDecision(state.decision, instance.project_id, at)

  const { effective, reason, decisionReason } = effectivenessOf(state, at, {
    projectMatches,
    defHashMatches,
    scopeMatches,
    decisionGoverning: decision.governing,
    decisionReason: decision.reason,
  })

  return {
    status: state.status,
    effective,
    reason,
    decisionReason,
    licenseId: state.licenseId,
    projectId: state.projectId,
    workflowInstanceId,
    boundDefKey: state.boundDefKey,
    boundDefHash: state.boundDefHash,
    licensedLevel: state.licensedLevel,
    resolvedLevel: resolvedLevelOf(state, effective),
    allowedActionKinds: state.actionKinds,
    actionScopeFingerprint: state.recordedFingerprint,
    decision: state.decision,
    issuer: state.issuer,
    effectiveAt: state.effectiveAt,
    expiresAt: state.expiresAt,
    generation: state.generation,
    eventCount: state.eventCount,
  }
}

/**
 * Does the authorizing decision still govern?
 *
 * Read from the decision's immutable lineage by the Chapter 11 pure core — the
 * same evaluation the principal-scoped reader performs — plus the project
 * agreement Ruling 2 requires at issuance, re-checked here because a licence
 * whose decision belonged to another project would be a cross-project grant
 * however it got recorded.
 */
async function evaluateDecision(
  pin: { decisionId: string; version: number; recordId: string },
  projectId: string,
  at: string,
): Promise<{ governing: boolean; reason: string | null }> {
  let lineage: unknown[]
  try {
    lineage = await createDecisionLedgerStore().lineage(pin.decisionId)
  } catch {
    return { governing: false, reason: 'unavailable' }
  }

  if (lineage.length === 0) return { governing: false, reason: 'not_found' }

  const first = lineage[0] as { projectId?: string }
  if (first?.projectId !== projectId) return { governing: false, reason: 'project_mismatch' }

  const result = isGoverningPure(lineage as never, { at })
  return { governing: result.governing, reason: result.governing ? null : result.reason }
}

/** Reasons that mean "the read itself failed" rather than "no licence exists". */
export const UNAVAILABLE_REASONS: readonly LicenseReason[] = ['unavailable']
