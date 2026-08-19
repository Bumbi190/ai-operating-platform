/**
 * lib/atlas/decision-ledger/types.ts — Chapter 11 Decision Ledger V1 domain.
 *
 * "Memory remembers context. The Decision Ledger remembers commitments." (§11.2)
 *
 * This is INSTITUTIONAL DECISION HISTORY: the immutable record of what the
 * organization formally decided, under whose authority, on what evidence, and
 * what happened afterwards. It is deliberately none of the following:
 *
 *   • not a general activity log (§11.3) — a successful workflow run is not a
 *     decision; the decision to grant that workflow more autonomy is
 *   • not Memory (§11.5) — Memory may explain a decision, the ledger proves it
 *     existed. D1 operator decisions remain a separate system
 *   • not an audit log (§11.6) — audit answers who acted, the ledger answers
 *     why the action was authorized
 *   • not approval history (§11.7) — "Not every approval becomes a strategic
 *     decision." Authorization V1 records approvals; this records the material
 *     organizational judgment some of them create
 *   • not the §8.4 Executive Calibration Ledger, which stays separate
 *
 * Nothing here executes anything. A ledger record is a commitment, never a
 * command: proposal ≠ decision ≠ authorization ≠ execution ≠ outcome.
 */

import type { AuthorizationId } from '@/lib/atlas/authorization/types'

// ── Identity (§11.21) ─────────────────────────────────────────────────────────

/**
 * Stable across every version of a decision. "The identifier should not change
 * when the decision is updated. Versions should belong to the same decision
 * lineage." (§11.21)
 */
export type DecisionId = string

/** One immutable ledger record. Records append; they are never rewritten. */
export type DecisionRecordId = string

// ── Materiality (§11.19) ──────────────────────────────────────────────────────

/**
 * The domains §11.19 names as making a decision material. A decision that
 * touches none of them does not belong in the ledger at all (§11.18), so the
 * write boundary rejects it rather than recording organizational noise.
 *
 * §11.19's test is qualitative — "Would forgetting this decision create
 * meaningful future confusion or risk?" — so V1 does not invent numeric
 * thresholds. It requires the domain to be declared and fails closed otherwise.
 */
export type MaterialityDomain =
  | 'strategy'
  | 'authority'
  | 'autonomy'
  | 'money'
  | 'risk'
  | 'customers'
  | 'brand'
  | 'project_mode'
  | 'roadmap'
  | 'major_architecture'
  | 'external_action_policy'
  | 'organizational_commitments'

// ── Lifecycle (§11.48–§11.58) ─────────────────────────────────────────────────

/**
 * The ten decision states Chapter 11 defines with a dedicated section
 * (§11.49–§11.58). Derived from the record chain, never stored as a mutable
 * column.
 *
 * Two states listed in §11.48's enumeration are deliberately NOT implemented in
 * V1: `Under Review` — §11.46 assigns the full review and decay architecture to
 * Chapter 12, a separate increment — and `Cancelled`, which §11.48 names but no
 * section defines. Implementing either would mean inventing semantics.
 */
export type DecisionStatus =
  | 'draft'       // §11.49 — being prepared; must not authorize action
  | 'proposed'    // §11.50 — ready for review, not yet authorized
  | 'approved'    // §11.51 — authorized actor accepted; effective date may be future
  | 'active'      // §11.52 — currently governs behaviour
  | 'rejected'    // §11.53 — must not authorize action
  | 'deferred'    // §11.54 — delayed, must not disappear
  | 'expired'     // §11.55 — no longer authorizes; must not depend on manual memory
  | 'superseded'  // §11.56 — replaced by a newer decision; history intact
  | 'reversed'    // §11.57 — actively undone; different from expiration
  | 'completed'   // §11.58 — finite outcome reached

/** The immutable acts appended to a decision's lineage. */
export type DecisionRecordType =
  | 'drafted'
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'deferred'
  | 'amended'      // §11.59/§11.62 — material amendment creates a new version
  | 'superseded'   // §11.56
  | 'reversed'     // §11.57
  | 'completed'    // §11.58
  | 'outcome_observed'
  | 'reviewed'

// ── Authority (§11.39, §11.40) ────────────────────────────────────────────────

/**
 * "The ledger must identify the authority behind the decision." (§11.39)
 * V1 recognises the founder/owner only; delegated approvers, governance policy,
 * autonomy licences, budget mandates and crisis authority all need machinery
 * FM.2 excludes from Stage 1.
 */
export type DecisionAuthorityBasis = 'founder_owner'

/**
 * Immutable approval-time provenance for one authority act (§11.41).
 *
 * It answers, from the record alone and without consulting live authorization
 * state: who exercised authority, under which authorization, at what moment,
 * for which exact material decision version, and for which act.
 *
 * §11.180 requires an active decision to be explainable as "approved under this
 * authority for these reasons and remains active until this review condition".
 * That is historical proof, so this record is self-sufficient: reconstructing it
 * later from live Authorization V1 state would be impossible once that
 * authorization legitimately expires.
 */
export interface DecisionAuthorityRecord {
  basis: DecisionAuthorityBasis
  /** Authorization V1 proof that was effective when the act occurred. */
  authorizationId: AuthorizationId
  /** The principal the authorization itself carried — not merely the caller. */
  principalId: string
  /** Which authority act this proved (approve / amend / reject / defer / reverse / supersede). */
  actionKind: string
  /**
   * sha256 over the bound projection of the exact act this authorized — not of
   * the state before it. See `binding.ts`.
   */
  boundVersionHash: string
  /**
   * When the authority act occurred. Named for the ACT, not for approval:
   * amendment, rejection, deferral, reversal and supersession are authority
   * acts too, and `approvedAt` on a reversal record would be a false statement
   * about institutional history.
   */
  authorityActAt: string
}

// ── Evidence (§11.27, §11.28) ─────────────────────────────────────────────────

/** A link out to evidence, preserving timestamp and scope (§11.27). */
export interface DecisionEvidenceReference {
  kind:       string
  ref:        string
  label:      string
  /** §11.27 — "Linked evidence should preserve timestamp and scope." */
  observedAt: string
  scope:      string
}

/**
 * §11.28 — what was known THEN. "The ledger should not depend entirely on a
 * live dashboard that may later change." Frozen at decision time and never
 * rewritten when the world moves on.
 */
export interface DecisionEvidenceSnapshot {
  capturedAt:   string
  measurements: Array<{ label: string; value: string }>
  dataFreshness: string
  /** §11.28 — "Known gaps." Recording ignorance honestly is part of the record. */
  knownGaps:    string[]
}

// ── Alternatives and expectation (§11.31, §11.30, §11.36, §11.47) ─────────────

/** §11.31 — "prevents future reviewers from assuming that no other path existed." */
export interface DecisionAlternative {
  label:    string
  summary:  string
  rejected: boolean
  /** §11.32 — why a serious alternative was not taken. */
  rejectionReason: string | null
}

/** §11.30 — recommendation confidence, preserved when material. */
export type DecisionConfidence = 'low' | 'medium' | 'high'

// ── Review (§11.46) ───────────────────────────────────────────────────────────

/**
 * §11.46 — "Every material decision should have a review date or condition."
 * Chapter 11 defines the FIELD; Chapter 12 defines the full review and decay
 * architecture, which is a separate increment and is not implemented here.
 */
export type DecisionReviewTrigger =
  | 'time_based'
  | 'outcome_based'
  | 'threshold_based'
  | 'incident_based'
  | 'mode_change_based'

export interface DecisionReviewCondition {
  trigger:     DecisionReviewTrigger
  description: string
  /** Set for a time-based review. */
  dueAt:       string | null
}

// ── Outcome (§11.96–§11.100) ──────────────────────────────────────────────────

/**
 * §11.96 outcome statuses, verbatim. `not_yet_measurable` is the explicit
 * UNKNOWN: absence of a failure signal is never success (§11.100 — "The system
 * should not reward unsafe reasoning merely because damage did not occur").
 *
 * "Outcome status should not overwrite the original decision." (§11.96)
 */
export type DecisionOutcomeStatus =
  | 'not_yet_measurable'
  | 'on_track'
  | 'mixed'
  | 'successful'
  | 'unsuccessful'
  | 'inconclusive'
  | 'harmful'
  | 'superseded_before_evaluation'

export interface DecisionOutcome {
  status:      DecisionOutcomeStatus
  summary:     string
  observedAt:  string
  /** §11.97 — outcome evidence is required; a claimed outcome needs support. */
  evidence:    DecisionEvidenceReference[]
}

// ── The immutable record ──────────────────────────────────────────────────────

/**
 * One appended act in a decision's lineage (§11.63). Rows are never updated or
 * deleted; a correction is a new record with explicit provenance (§11.60–§11.62).
 */
export interface DecisionRecord {
  recordId:   DecisionRecordId
  decisionId: DecisionId
  type:       DecisionRecordType
  occurredAt: string
  /** §11.12 — V1 ledger decisions are project-scoped. */
  projectId:  string
  principalId: string

  /** §11.22/§11.23 — identity and the commitment itself. */
  title:     string
  statement: string
  /** §11.24 — the Executive recommendation, preserved SEPARATELY from the decision. */
  recommendation: string | null
  /** §11.26 — why the final decision was made. */
  rationale: string | null

  materiality: MaterialityDomain[]
  authority:   DecisionAuthorityRecord | null
  evidence:    DecisionEvidenceReference[]
  snapshot:    DecisionEvidenceSnapshot | null
  alternatives: DecisionAlternative[]
  confidence:  DecisionConfidence | null
  /** §11.36 — what was expected, which later evaluation is measured against. */
  expectedImpact: string | null
  /** §11.43 — when the decision begins to govern; may differ from approval. */
  effectiveAt: string | null
  /** §11.45 — temporary decisions expire safely, without manual memory. */
  expiresAt:   string | null
  review:      DecisionReviewCondition | null
  /** §11.47 — conditions that require reversal or reconsideration. */
  reversalConditions: string[]

  /** §11.56 — set by a `superseded` act. */
  supersededBy: DecisionId | null
  /** §11.59 — version within the lineage; identity stays stable. */
  version:      number
  /** Outcome carried by an `outcome_observed` act (§11.96). */
  outcome:      DecisionOutcome | null
  /** §11.102 — a lesson from review. Never rewrites the original reasoning. */
  reviewNote:   string | null
  /** Why: rejection, deferral, amendment, reversal (§11.53/§11.54/§11.57/§11.59). */
  reason:       string | null

  /**
   * How many records the lineage held when this act was derived — optimistic
   * concurrency, not decision content (so it is not authority-bound).
   *
   * Two writers reading the same lineage produce the same value, and the
   * database's partial unique index rejects the loser with 23505. That is what
   * stops two individually-valid candidates — an approval and a deferral, an
   * amendment and a reversal — from combining into a lineage the pure core
   * would then refuse to read. Annotations are excluded from the index and
   * never conflict.
   */
  baseRecordCount: number
}

// ── Derived state ─────────────────────────────────────────────────────────────

export interface DerivedDecisionState {
  decisionId:  DecisionId
  status:      DecisionStatus
  projectId:   string
  version:     number
  title:       string
  statement:   string
  recommendation: string | null
  rationale:   string | null
  materiality: MaterialityDomain[]
  authority:   DecisionAuthorityRecord | null
  /** Evidence as it stood at decision time — never refreshed (§11.28). */
  evidence:    DecisionEvidenceReference[]
  snapshot:    DecisionEvidenceSnapshot | null
  alternatives: DecisionAlternative[]
  confidence:  DecisionConfidence | null
  expectedImpact: string | null
  effectiveAt: string | null
  expiresAt:   string | null
  review:      DecisionReviewCondition | null
  reversalConditions: string[]
  supersededBy: DecisionId | null
  /** Latest observed outcome. Distinct from `expectedImpact` (§11.98). */
  outcome:     DecisionOutcome | null
  /** Every review note in order — learning accumulates, it never overwrites. */
  reviewNotes: string[]
  decidedAt:   string | null
  recordCount: number
  lastRecordAt: string
  /** Full lineage in canonical order, for audit (§11.63). */
  lineage:     Array<{ recordId: string; type: DecisionRecordType; occurredAt: string; version: number }>
}

/** Why a decision is or is not currently governing behaviour. */
export type DecisionEffectivenessReason =
  | 'active'
  | 'draft'
  | 'proposed'
  | 'rejected'
  | 'deferred'
  | 'not_yet_effective'
  | 'expired'
  | 'superseded'
  | 'reversed'
  | 'completed'
  | 'malformed_lineage'

/**
 * EI-S1.3B-R1 removed `authority_not_effective` and the `authorityReason` field.
 * Whether a decision governs is a fact about the DECISION — its status, its
 * effective date, its expiry (§11.43, §11.45, §11.55, §11.180) — not about the
 * live state of the authorization that once approved it. Nothing could produce
 * those values any more, and a reason no code can return is a false promise to
 * anyone reading this type.
 */
export interface DecisionEffectivenessResult {
  governing: boolean
  reason:    DecisionEffectivenessReason
  state:     DerivedDecisionState | null
}

/** Thrown by the pure core when a record chain could not be a real history. */
export class MalformedDecisionLineageError extends Error {
  constructor(public readonly invariant: string, detail?: string) {
    super(`decision-ledger: invariant ${invariant} failed${detail ? ` (${detail})` : ''}`)
    this.name = 'MalformedDecisionLineageError'
  }
}
