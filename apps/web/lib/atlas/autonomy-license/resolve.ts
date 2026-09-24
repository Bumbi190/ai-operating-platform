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

export interface ResolveArgs {
  store?: AutonomyLicenseStore
  /** Injected for tests; production reads the workflow instance server-side. */
  instance?: { project_id: string; def_key: string; def_hash: string } | null
  /** Injected for tests; the Decision Ledger lineage loader. */
  decisionLineage?: (decisionId: string) => Promise<unknown[]>
}

/**
 * The current licence lineage for an instance: the one whose latest act was
 * appended last.
 *
 * Ordering is by `eventSeq`, the database's monotonic identity column, not by
 * time — a replacement lineage appended in the same millisecond as the act that
 * superseded it must still win, and only the sequence can say that.
 */
function currentLineage(events: readonly LicenseEvent[]): LicenseEvent[] | null {
  if (events.length === 0) return null
  const byLicense = new Map<string, LicenseEvent[]>()
  for (const event of events) {
    byLicense.set(event.licenseId, [...(byLicense.get(event.licenseId) ?? []), event])
  }
  let best: LicenseEvent[] | null = null
  let bestSeq = -1
  for (const lineage of byLicense.values()) {
    const seq = Math.max(...lineage.map(e => e.eventSeq))
    if (seq > bestSeq) { bestSeq = seq; best = lineage }
  }
  return best
}

export async function resolveAutonomyLicense(
  workflowInstanceId: string,
  at: string,
  args: ResolveArgs = {},
): Promise<ResolvedAutonomyLicense> {
  const store = args.store ?? createAutonomyLicenseStore()

  // ── The subject ───────────────────────────────────────────────────────────
  // Resolved server-side. A caller names an instance and nothing else; the
  // project and definition it belongs to are facts, not arguments.
  const instance = args.instance !== undefined
    ? args.instance
    : await readInstance(createAdminClient() as never, workflowInstanceId)
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

  const lineage = currentLineage(events)
  if (!lineage) return { ...noLicense(workflowInstanceId, 'no_license'), projectId: instance.project_id }

  let state
  try {
    state = deriveLicenseState(lineage)
  } catch (error) {
    if (error instanceof MalformedLicenseLineageError) {
      return { ...noLicense(workflowInstanceId, 'malformed_lineage'), projectId: instance.project_id }
    }
    throw error
  }

  // ── The three derived facts a pure fold cannot know ───────────────────────
  const defHashMatches =
    state.boundDefKey === instance.def_key && state.boundDefHash === instance.def_hash

  const scopeMatches = !scopeDrifted(state.actionKinds, state.boundDefKey, state.recordedFingerprint)

  const decision = await evaluateDecision(state.decision, instance.project_id, at, args)

  const { effective, reason, decisionReason } = effectivenessOf(state, at, {
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
  args: ResolveArgs,
): Promise<{ governing: boolean; reason: string | null }> {
  let lineage: unknown[]
  try {
    lineage = args.decisionLineage
      ? await args.decisionLineage(pin.decisionId)
      : await createDecisionLedgerStore().lineage(pin.decisionId)
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
