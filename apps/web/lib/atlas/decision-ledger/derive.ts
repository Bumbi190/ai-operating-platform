/**
 * lib/atlas/decision-ledger/derive.ts — Decision Ledger V1 pure core.
 *
 * Deterministic derivation of decision state from an immutable record lineage.
 * Zero I/O: no database, no network, no filesystem, no clock read — evaluation
 * time is injected, so identical records plus identical `at` always yield
 * identical output.
 *
 * Three canonical properties are load-bearing:
 *
 *  1. IDENTITY IS STABLE, VERSIONS ACCUMULATE (§11.21, §11.59). A decision may
 *     change without losing identity; every material edit is a new version in
 *     the same lineage, and the original statement survives.
 *
 *  2. EXPIRY AND EFFECTIVE DATE ARE DERIVED FROM TIME (§11.43, §11.55).
 *     "Expiration should not depend on manual memory" — an expired decision
 *     stops governing with no job and no `expired` record, and an approved
 *     decision with a future effective date does not govern yet.
 *
 *  3. WHAT WAS KNOWN THEN STAYS KNOWN THEN (§11.28, §11.60). Evidence,
 *     snapshot, rationale and alternatives are carried from the record that
 *     decided them. Later records append; they never rewrite history.
 *
 * APPROVAL IS A HISTORICAL ACT, NOT A CONTINUING LEASE (EI-S1.3B-R1).
 * §11.180 requires an active decision to explain itself as "approved under this
 * authority for these reasons and remains active until this review condition" —
 * the decision remains active until ITS review condition, not until the
 * approving authorization expires. §11.44/§11.45 give the decision its own
 * duration and expiration, and §11.55 says an expired DECISION stops
 * authorizing action. Authorization V1's own expiry bounds the authority to
 * ACT (§27.319); it does not retroactively unmake a decision already taken.
 *
 * So authority is verified once, when the act occurs, and the proof is recorded
 * immutably. Governing is then decided by the decision's own lifecycle. A later
 * revocation is a reason to REVIEW the decision, never a silent retroactive
 * deletion of the approval act.
 */

import {
  MalformedDecisionLineageError,
  type DecisionEffectivenessResult,
  type DecisionRecord,
  type DecisionRecordType,
  type DecisionStatus,
  type DerivedDecisionState,
} from './types'

/** Acts that settle a proposal. */
const SETTLING = new Set<DecisionRecordType>(['approved', 'rejected', 'deferred'])
/** Acts that close an approved decision. */
const CLOSING = new Set<DecisionRecordType>(['superseded', 'reversed', 'completed'])
/** Acts that annotate without changing the lifecycle position. */
const ANNOTATING = new Set<DecisionRecordType>(['outcome_observed', 'reviewed'])

// ── Ordering ──────────────────────────────────────────────────────────────────

/**
 * Deterministic lineage order: by time, then by record id so equal timestamps
 * can never reorder between reads. Byte-identical duplicates collapse, which
 * makes a retried append safe rather than a contradiction.
 */
export function orderDecisionRecords(records: DecisionRecord[]): DecisionRecord[] {
  const unique = new Map<string, DecisionRecord>()
  for (const record of records) {
    const existing = unique.get(record.recordId)
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
      throw new MalformedDecisionLineageError('record-id-stable', record.recordId)
    }
    unique.set(record.recordId, record)
  }
  return [...unique.values()].sort((a, b) => {
    const at = Date.parse(a.occurredAt)
    const bt = Date.parse(b.occurredAt)
    if (Number.isNaN(at) || Number.isNaN(bt)) {
      throw new MalformedDecisionLineageError('record-timestamp-valid')
    }
    return at - bt || (a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : 0)
  })
}

// ── Derivation ────────────────────────────────────────────────────────────────

/**
 * Fold a lineage into current state. Raises on any chain that could not be a
 * real history — reading a broken institutional record permissively is exactly
 * the wrong failure mode.
 */
export function deriveDecisionState(
  records: DecisionRecord[],
  options: { at: string },
): DerivedDecisionState {
  const ordered = orderDecisionRecords(records)
  if (ordered.length === 0) throw new MalformedDecisionLineageError('lineage-non-empty')

  const first = ordered[0]
  if (first.type !== 'drafted' && first.type !== 'proposed') {
    throw new MalformedDecisionLineageError('lineage-starts-with-draft-or-proposal', first.type)
  }

  const decisionId = first.decisionId
  const projectId = first.projectId
  if (!projectId) throw new MalformedDecisionLineageError('project-scope-required')

  let status: DecisionStatus = first.type === 'drafted' ? 'draft' : 'proposed'
  let current = first
  let decidedAt: string | null = null
  let supersededBy: string | null = null
  let version = first.version
  let outcome = first.outcome
  const reviewNotes: string[] = []

  for (const [index, record] of ordered.entries()) {
    if (record.decisionId !== decisionId) {
      throw new MalformedDecisionLineageError('single-decision-lineage', record.recordId)
    }
    // §11.12 — a decision's project scope is fixed. A different scope is a
    // different decision, never an amendment.
    if (record.projectId !== projectId) {
      throw new MalformedDecisionLineageError('project-scope-stable', record.recordId)
    }
    if (!record.principalId) {
      throw new MalformedDecisionLineageError('principal-required', record.recordId)
    }
    if (record.reviewNote) reviewNotes.push(record.reviewNote)

    if (index === 0) continue

    if (record.type === 'drafted' || record.type === 'proposed') {
      // A proposal may follow a draft, but nothing may re-open a settled decision.
      if (status !== 'draft') throw new MalformedDecisionLineageError('reopen-not-permitted', record.recordId)
      status = record.type === 'proposed' ? 'proposed' : 'draft'
      current = record
      version = record.version
      continue
    }

    if (SETTLING.has(record.type)) {
      if (status !== 'draft' && status !== 'proposed' && status !== 'deferred') {
        throw new MalformedDecisionLineageError('settle-requires-open-decision', record.recordId)
      }
      if (record.type === 'approved') {
        // §11.39 — the ledger must identify the authority behind the decision.
        if (!record.authority) throw new MalformedDecisionLineageError('approval-requires-authority', record.recordId)
        if (!record.authority.authorizationId) {
          throw new MalformedDecisionLineageError('approval-requires-authorization-reference', record.recordId)
        }
        // §11.43 — the effective date defines when the decision begins to govern.
        if (!record.effectiveAt) throw new MalformedDecisionLineageError('approval-requires-effective-date', record.recordId)
        if (Number.isNaN(Date.parse(record.effectiveAt))) {
          throw new MalformedDecisionLineageError('effective-date-valid', record.recordId)
        }
        status = 'approved'
        decidedAt = record.occurredAt
      } else {
        status = record.type === 'rejected' ? 'rejected' : 'deferred'
        decidedAt = record.occurredAt
      }
      current = record
      version = record.version
      continue
    }

    if (record.type === 'amended') {
      // §11.59 — "Every material edit should create a new version." Identity and
      // lineage survive; the earlier version remains in the record chain.
      if (record.version <= version) {
        throw new MalformedDecisionLineageError('amendment-increments-version', record.recordId)
      }
      if (!record.reason) throw new MalformedDecisionLineageError('amendment-requires-reason', record.recordId)
      current = record
      version = record.version
      continue
    }

    if (CLOSING.has(record.type)) {
      // `active` and `expired` are derived from time after the fold, so during
      // the fold an approved decision is exactly `approved`.
      if (status !== 'approved') {
        throw new MalformedDecisionLineageError('close-requires-approved-decision', record.recordId)
      }
      if (record.type === 'superseded') {
        // §11.56 — "The relationship should be explicit: Superseded by Decision X."
        if (!record.supersededBy) throw new MalformedDecisionLineageError('supersede-requires-successor', record.recordId)
        supersededBy = record.supersededBy
        status = 'superseded'
      } else if (record.type === 'reversed') {
        // §11.57 — reversal preserves its reason and is distinct from expiry.
        if (!record.reason) throw new MalformedDecisionLineageError('reversal-requires-reason', record.recordId)
        status = 'reversed'
      } else {
        status = 'completed'
      }
      current = record
      continue
    }

    if (ANNOTATING.has(record.type)) {
      // §11.96 — "Outcome status should not overwrite the original decision."
      // An observation records what happened; it never edits what was decided.
      if (record.type === 'outcome_observed') {
        if (!record.outcome) throw new MalformedDecisionLineageError('outcome-record-requires-outcome', record.recordId)
        outcome = record.outcome
      }
      continue
    }

    throw new MalformedDecisionLineageError('unknown-record-type', record.type)
  }

  // Time-derived lifecycle (§11.43, §11.55). An approved decision governs only
  // once its effective date arrives, and stops governing when it expires —
  // neither depends on anyone remembering to write a record.
  const now = Date.parse(options.at)
  if (status === 'approved' && current.effectiveAt && Date.parse(current.effectiveAt) <= now) {
    status = 'active'
  }
  if ((status === 'approved' || status === 'active') && current.expiresAt) {
    if (Date.parse(current.expiresAt) <= now) status = 'expired'
  }

  // §11.24/§11.28 — a fact belongs to the record that established it. A later
  // act that does not restate the recommendation, the evidence as it stood, or
  // the alternatives considered must not erase them from the decision's
  // history; the most recent record that actually carried a value wins.
  const carried = <T>(pick: (r: DecisionRecord) => T, empty: (v: T) => boolean): T => {
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      const value = pick(ordered[i])
      if (!empty(value)) return value
    }
    return pick(current)
  }
  const isNullish = (v: unknown) => v === null || v === undefined
  const isEmptyList = (v: unknown[]) => !Array.isArray(v) || v.length === 0

  const last = ordered[ordered.length - 1]
  return {
    decisionId,
    status,
    projectId,
    version,
    title:          current.title,
    statement:      current.statement,
    recommendation: carried(r => r.recommendation, isNullish),
    rationale:      carried(r => r.rationale, isNullish),
    materiality:    current.materiality,
    authority:      carried(r => r.authority, isNullish),
    evidence:       carried(r => r.evidence, isEmptyList),
    snapshot:       carried(r => r.snapshot, isNullish),
    alternatives:   carried(r => r.alternatives, isEmptyList),
    confidence:     carried(r => r.confidence, isNullish),
    expectedImpact: carried(r => r.expectedImpact, isNullish),
    effectiveAt:    current.effectiveAt,
    expiresAt:      current.expiresAt,
    review:         carried(r => r.review, isNullish),
    reversalConditions: carried(r => r.reversalConditions, isEmptyList),
    supersededBy,
    outcome,
    reviewNotes,
    decidedAt,
    recordCount: ordered.length,
    lastRecordAt: last.occurredAt,
    lineage: ordered.map(r => ({
      recordId: r.recordId, type: r.type, occurredAt: r.occurredAt, version: r.version,
    })),
  }
}

// ── Governing state ───────────────────────────────────────────────────────────

/**
 * Is this decision currently governing behaviour (§11.52), and if not, why?
 *
 * This is the complete evaluation. It takes no security-sensitive parameters,
 * so no caller can weaken it by omitting one: the approving authority was
 * verified and recorded when the act occurred, and from then on the decision's
 * own lifecycle decides.
 */
export function isDecisionGoverning(
  records: DecisionRecord[],
  query: { at: string },
): DecisionEffectivenessResult {
  let state: DerivedDecisionState
  try {
    state = deriveDecisionState(records, { at: query.at })
  } catch {
    return { governing: false, reason: 'malformed_lineage', state: null }
  }

  const deny = (reason: DecisionEffectivenessResult['reason']) =>
    ({ governing: false, reason, state }) as DecisionEffectivenessResult

  switch (state.status) {
    case 'draft':      return deny('draft')
    case 'proposed':   return deny('proposed')
    case 'rejected':   return deny('rejected')
    case 'deferred':   return deny('deferred')
    case 'expired':    return deny('expired')
    case 'superseded': return deny('superseded')
    case 'reversed':   return deny('reversed')
    case 'completed':  return deny('completed')
    case 'approved':   return deny('not_yet_effective')
    case 'active':
      return { governing: true, reason: 'active', state }
  }
}

// ── Materiality (§11.19) ──────────────────────────────────────────────────────

/**
 * Does this decision require explicit human authorization?
 *
 * §11.3 and §11.17 establish that only material organizational judgment belongs
 * in the ledger at all, and §11.39 requires every ledger decision to identify
 * its authority. So in V1 the answer is unconditionally yes: anything admissible
 * to the ledger is material by construction, and materiality must be positively
 * declared (§11.18 keeps routine activity out).
 *
 * §11.19's test is a qualitative judgement, not a computable threshold, so
 * nothing here infers non-materiality. Atlas cannot self-classify its way past
 * human authority.
 */
export function requiresHumanAuthorization(input: { materiality: string[] }): boolean {
  void input
  return true
}

/** §11.18/§11.19 — admissibility: a ledger decision must declare its materiality. */
export function isLedgerMaterial(input: { materiality: string[] }): boolean {
  return Array.isArray(input.materiality) && input.materiality.length > 0
}
