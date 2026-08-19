/**
 * lib/atlas/decision-ledger/principal-read.ts — principal-scoped read boundary
 * for institutional decision history.
 *
 * Reads fail closed and follow the EI-S1.3A-R1 ordering rule: authenticate
 * first, then read, then prove project authority from the lineage's own
 * recorded scope. An unknown decision and one belonging to another project
 * return the SAME `not_permitted`, so this can never become a decision-id
 * existence oracle. `CRON_SECRET` is never accepted as user authorization.
 *
 * V1 is project-scoped only. Chapter 11 §11.10/§11.11 describe global and
 * portfolio decisions, but §11.73 requires portfolio entries to use "governed
 * summaries" — machinery FM.2 does not fund in Stage 1 — so cross-project and
 * world reads are denied rather than guessed at.
 *
 * `isDecisionGoverning` optionally resolves the referenced Authorization V1
 * proof so a caller learns whether a decision actually governs right now,
 * rather than trusting a stored flag.
 */

import 'server-only'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { deriveDecisionState, isDecisionGoverning as isGoverningPure } from './derive'
import { createDecisionLedgerStore, type DecisionLedgerStore } from './store'
import type {
  DecisionEffectivenessResult,
  DecisionRecord,
  DerivedDecisionState,
} from './types'

export type DecisionReadStatus =
  | 'ok'
  | 'no_principal'
  /** Caller named the scope themselves — denial reveals nothing new. */
  | 'project_denied'
  /** Deliberately indistinguishable: unknown decision, or outside the caller's projects. */
  | 'not_permitted'
  | 'malformed'
  | 'unavailable'

export interface DecisionReadResult {
  state:   DerivedDecisionState | null
  /** Full immutable lineage, for audit (§11.63). Empty unless permitted. */
  lineage: DecisionRecord[]
  status:  DecisionReadStatus
}

interface ReadArgs {
  store?: DecisionLedgerStore
  now?:   string
}

const DENY = (status: DecisionReadStatus): DecisionReadResult =>
  ({ state: null, lineage: [], status })

/** Read one decision with its full record lineage. */
export async function resolveDecision(
  decisionId: string,
  args: ReadArgs = {},
): Promise<DecisionReadResult> {
  const access = await resolveProjectAccess()
  if (!access.ok) return DENY('no_principal')

  const store = args.store ?? createDecisionLedgerStore()
  const at = args.now ?? new Date().toISOString()

  let lineage: DecisionRecord[]
  try {
    lineage = await store.lineage(decisionId)
  } catch {
    return DENY('unavailable')
  }
  if (lineage.length === 0) return DENY('not_permitted')
  if (!assertProjectAllowed(lineage[0].projectId, access.allowedProjectIds)) return DENY('not_permitted')

  try {
    return { state: deriveDecisionState(lineage, { at }), lineage, status: 'ok' }
  } catch {
    return DENY('malformed')
  }
}

/**
 * Does this decision currently govern behaviour (§11.52)?
 *
 * Governance is read from the decision alone. §11.180 requires an active
 * decision to explain itself as "approved under this authority … and remains
 * active until this review condition": the authority is the approval-time fact
 * recorded on the record, and the decision's own effective date, expiry and
 * review condition (§11.44, §11.45, §11.55) decide how long it stands.
 *
 * An earlier revision re-resolved the approval's authorization here and let a
 * later expiry silently un-govern a standing decision — a continuing lease canon
 * never grants. Worse, the target and action to check were optional caller
 * arguments, so omitting them weakened validation to nothing. Both are gone: no
 * caller can influence, and no caller need supply, what makes a decision
 * effective. A revoked authorization is a §11.47 trigger for review, not a
 * retroactive unmaking of the decision.
 */
export async function isDecisionGoverning(
  decisionId: string,
  args: ReadArgs = {},
): Promise<DecisionEffectivenessResult & { status: DecisionReadStatus }> {
  const at = args.now ?? new Date().toISOString()
  const read = await resolveDecision(decisionId, { ...args, now: at })
  if (read.status !== 'ok' || !read.state) {
    return { governing: false, reason: 'malformed_lineage', state: null, status: read.status }
  }
  return { ...isGoverningPure(read.lineage, { at }), status: 'ok' }
}

/**
 * Bounded audit listing for one project, newest first. The caller names the
 * scope, so `project_denied` reveals nothing they did not already assert.
 */
export async function listProjectDecisions(
  projectId: string,
  args: ReadArgs & { limit?: number } = {},
): Promise<{ decisions: DerivedDecisionState[]; status: DecisionReadStatus }> {
  const access = await resolveProjectAccess()
  if (!access.ok) return { decisions: [], status: 'no_principal' }
  if (!assertProjectAllowed(projectId, access.allowedProjectIds)) return { decisions: [], status: 'project_denied' }

  const store = args.store ?? createDecisionLedgerStore()
  const at = args.now ?? new Date().toISOString()

  let records: DecisionRecord[]
  try {
    records = await store.byProject(projectId, args.limit)
  } catch {
    return { decisions: [], status: 'unavailable' }
  }

  const byDecision = new Map<string, DecisionRecord[]>()
  for (const record of records) {
    byDecision.set(record.decisionId, [...(byDecision.get(record.decisionId) ?? []), record])
  }

  const decisions: DerivedDecisionState[] = []
  for (const lineage of byDecision.values()) {
    try {
      decisions.push(deriveDecisionState(lineage, { at }))
    } catch {
      // A malformed lineage is skipped rather than poisoning the whole listing;
      // `resolveDecision` reports it explicitly for that single decision.
    }
  }
  // Deterministic read ordering: newest activity first, id as stable tiebreak.
  decisions.sort((a, b) =>
    (a.lastRecordAt < b.lastRecordAt ? 1 : a.lastRecordAt > b.lastRecordAt ? -1 : 0) ||
    (a.decisionId < b.decisionId ? -1 : a.decisionId > b.decisionId ? 1 : 0),
  )
  return { decisions, status: 'ok' }
}

/**
 * Decisions still awaiting resolution or review — the audit question §11.54
 * ("Deferred decisions must not disappear") and §11.46 (review conditions)
 * make answerable. Chapter 12 owns the full review-queue architecture.
 */
export async function listUnresolvedDecisions(
  projectId: string,
  args: ReadArgs & { limit?: number } = {},
): Promise<{ decisions: DerivedDecisionState[]; status: DecisionReadStatus }> {
  const listed = await listProjectDecisions(projectId, args)
  if (listed.status !== 'ok') return listed
  const at = args.now ?? new Date().toISOString()
  const open = new Set(['draft', 'proposed', 'deferred'])

  return {
    decisions: listed.decisions.filter(decision => {
      if (open.has(decision.status)) return true
      // Active decisions whose time-based review has come due.
      if (decision.status !== 'active') return false
      const dueAt = decision.review?.dueAt
      return !!dueAt && Date.parse(dueAt) <= Date.parse(at)
    }),
    status: 'ok',
  }
}
