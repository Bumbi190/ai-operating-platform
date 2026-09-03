/**
 * lib/workflows/bundle/types.ts — the Month Release Bundle schema, v0.
 *
 * A READ MODEL. It answers one question for one month: "where is this, and what
 * is holding it up?" It decides nothing, executes nothing and writes nothing.
 *
 * ── Why a separate module from lib/workflows/types.ts ────────────────────────
 * That file is the generic engine domain and is forbidden from naming a month.
 * This file is the opposite: it exists to present ONE definition's progress to a
 * person. Keeping them apart is what stops product vocabulary leaking into the
 * engine. Nothing here is imported by the engine; the dependency runs one way.
 *
 * ── The one invariant that shapes this whole schema ──────────────────────────
 * Familje-Stundens release gate is FAIL-OPEN: a month with no `month_releases`
 * row reads as released. So the absence of a fact is not neutral here — it is
 * the dangerous case. Every field that could be "we did not look" is therefore
 * tri-state, and `UNKNOWN` is treated as a blocker, never as a pass. A schema
 * that allowed `boolean` for these would make the unsafe value unrepresentable
 * as distinct from the safe one.
 */

/**
 * Three-valued, deliberately. `UNKNOWN` means Omnira has no evidence — which is
 * NOT the same as `NO`, and must never collapse into it or into `YES`.
 */
export type Tri = 'YES' | 'NO' | 'UNKNOWN'

/**
 * A declared check's projected status.
 *
 * `NOT_EXERCISED` is the point of this slice: a check that exists in the
 * definition but has never produced a single evidence row. Before this bundle
 * there was no way to see the difference between "checked and passed" and
 * "declared and never run", and the second one looks identical to the first on
 * any dashboard that only counts passes.
 */
export type CheckStatus =
  | 'PASS'
  | 'FAIL'
  | 'BLOCKED'
  | 'ERROR'
  | 'SKIPPED'
  | 'NOT_EXERCISED'

/** Where a projected status came from. Mirrors section F's required vocabulary. */
export type Provenance =
  | 'ATTESTED'
  | 'OBSERVED'
  | 'READ_ONLY_ACTION'
  | 'NOT_EVALUATED'

/** How the adapter declares a check may be answered. */
export type CheckKind = 'ATTESTABLE' | 'OBSERVED_ONLY' | 'READ_ONLY_EXECUTABLE'

export type HardGateStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_EVALUATED'

/** The four bundle-level approval categories the 19 state gates roll up into. */
export type ApprovalCategory = 'PLAN' | 'CREATIVE' | 'RELEASE' | 'COMMS'

export type ApprovalStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'UNKNOWN'

/**
 * PRODUCT readiness only. Deliberately says nothing about newsletter or social:
 * a marketing capability that does not exist must never make approved product
 * access look invalid.
 */
export type ProductReadiness =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'AWAITING_APPROVAL'
  | 'READY_FOR_RELEASE_APPROVAL'
  | 'APPROVED_NOT_RELEASED'
  | 'RELEASED'
  | 'COMPLETE'

/** Comms readiness, tracked separately and never folded into product readiness. */
export type CommsReadiness = 'NOT_READY' | 'READY' | 'BLOCKED' | 'NOT_IMPLEMENTED'

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface BundleWarning {
  code: string
  severity: Severity
  message: string
  /** Which state or gate it attaches to, when it attaches to one. */
  subject: string | null
  /** True when this warning alone prevents product release readiness. */
  blocking: boolean
}

export interface CheckProjection {
  check_key: string
  state: string
  kind: CheckKind
  status: CheckStatus
  provenance: Provenance
  required: boolean
  /** Newest evidence row for this (state, check_key), if any. */
  recorded_at: string | null
  /** When the producer OBSERVED it, which is not when Omnira recorded it. */
  observed_at: string | null
  producer: string | null
  /** Evidence rows seen for this key. 0 ⇒ NOT_EXERCISED. */
  evidence_count: number
  /** True when the newest evidence was produced against a different target. */
  stale: boolean
}

export interface HardGateProjection {
  id: string
  rule: string
  enforced_at: string[]
  status: HardGateStatus
  provenance: Provenance
  evaluated_at: string | null
  blocking: boolean
  /** Why it is not PASS. Null when it passes. */
  reason: string | null
  /** Declared checks that would answer this gate but have no evidence. */
  missing_evidence: string[]
}

export interface ApprovalProjection {
  category: ApprovalCategory
  status: ApprovalStatus
  /** The underlying workflow states that roll up into this category. */
  states: string[]
  /** States in this category still awaiting a human decision. */
  pending_states: string[]
  approver: string | null
}

export interface SectionSummary {
  /** Coarse status for the section, derived only from evidence actually present. */
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' | 'BLOCKED' | 'UNKNOWN'
  checks_total: number
  checks_passed: number
  checks_failed: number
  checks_not_exercised: number
  states: string[]
}

export interface TechnicalSection extends SectionSummary {
  /**
   * The fail-open invariant, tri-state and never inferred.
   *
   * `UNKNOWN` is the honest answer today: no declared check answers it, and
   * `month_releases` lives in Familje-Stundens database, which this projection
   * deliberately does not read. Inferring it from upload or deploy evidence
   * would be exactly the silent assumption the invariant exists to prevent.
   */
  release_gate_row_present: Tri
  release_gate_evidence_source: string | null
  release_instant_computed: Tri
  manifest_in_sync: Tri
  anonymous_access_denied: Tri
  deployment_sha_verified: Tri
}

export interface CostSection {
  /** Null until a PLAN gate records a ceiling. Not connected in v0. */
  approved_ceiling_minor: number | null
  known_spend_minor: number | null
  currency: string | null
  status: 'NOT_CONNECTED' | 'WITHIN_CEILING' | 'OVER_CEILING' | 'UNKNOWN'
}

export interface MonthReleaseBundle {
  schema_version: 1
  generated_at: string

  identity: {
    /** Canonical month identity. Always YYYY-MM. */
    month_key: string
    workflow_def_key: string | null
    workflow_def_version: number | null
    workflow_def_hash: string | null
    workflow_instance_id: string | null
  }

  workflow: {
    current_state: string | null
    previous_state: string | null
    status: string | null
    created_at: string | null
    closed_at: string | null
    wake_at: string | null
    last_tick_at: string | null
    last_tick_outcome: string | null
    transition_count: number
    /** States actually entered, in order. */
    states_reached: string[]
  }

  content: SectionSummary
  media: SectionSummary
  technical: TechnicalSection

  approvals: Record<ApprovalCategory, ApprovalProjection>
  cost: CostSection

  checks: CheckProjection[]
  hard_gates: HardGateProjection[]

  warnings: BundleWarning[]

  readiness: {
    product: ProductReadiness
    comms: CommsReadiness
    /** Product-release blockers. Non-empty ⇒ product is never RELEASE-ready. */
    blockers: BundleWarning[]
    warnings: BundleWarning[]
    informational: BundleWarning[]
  }
}
