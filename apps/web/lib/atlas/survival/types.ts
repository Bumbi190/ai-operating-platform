/**
 * lib/atlas/survival/types.ts — Atlas survival vocabulary (Phase 1, read-only).
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────
 * The observable economic condition of the platform, expressed as one of five
 * states, plus the autonomy ceiling that condition implies. Phase 1 only
 * OBSERVES: nothing here pauses, spends, refuses or authorizes anything.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 *
 *     survival pressure may only LOWER autonomy.
 *     it never grants authority, widens a licence, or increases any permission.
 *
 * Formally, `effectiveAutonomy = min(licensedAutonomy, survivalCeiling)` — see
 * `ceiling.ts`. Because the ceiling is never above the licensed level and never
 * grants anything, there is no code path in which self-preservation increases
 * what Omnira may do. That property is structural, not a policy we promise to
 * keep. Canon: Ch18 §18.247 ("No system component may grant itself more
 * authority"), §18.274 ("Reduce autonomy when conditions weaken").
 *
 * ── THREE SCALES EXIST. NEVER CONFLATE THEM. ────────────────────────────────
 * `docs/autonomy/RISK-AND-AUTHORITY.md` §0 records three unrelated vocabularies
 * already in this codebase:
 *
 *   1. Chapter 18 Autonomy Licensing — "Autonomy License L0–L6": how much a
 *      production workflow may do without per-action approval. **This file uses
 *      scale 1**, because survival pressure restricts exactly that question.
 *   2. Mission Risk Level 0–3: oversight needed before a coding worker's PR is
 *      promoted. Not this.
 *   3. `MissionRecord.risks` severity low/medium/high. Not this.
 *
 * A level from this module must always be written qualified — "Autonomy License
 * L3" — never bare "L3", and never beside a Mission Risk Level. The two numbers
 * are unrelated and must not be compared or added (§0).
 *
 * ── MONEY IS SEK, DELIBERATELY ──────────────────────────────────────────────
 * Every amount here is `number` SEK with an explicit `Sek` suffix, because that
 * is the unit the cost ledger already uses end to end: `project_budgets.…_sek`,
 * `budget_headroom()`'s `remaining_sek`, and `SpendVerdict`'s `headroomSek` /
 * `estimatedSek`. `MissionBudget.limitMinor` (minor units, in the authority
 * chain) is a different system for a different question and is NOT converted,
 * mirrored or duplicated here. Introducing a second money representation would
 * be exactly the drift this module exists to avoid.
 */

import type { BudgetScope } from '@/lib/cost/budget-gate'

// ─── Survival state ─────────────────────────────────────────────────────────

/**
 * The five states, ordered least to most restrictive. The order is load-bearing:
 * `derive.ts` compares states by index and every cap is a `min`, so a state can
 * only ever be pulled toward HIBERNATE by new information.
 */
export const SURVIVAL_STATES = [
  'EXPAND',
  'NORMAL',
  'CONSERVE',
  'CRITICAL',
  'HIBERNATE',
] as const

export type SurvivalState = (typeof SURVIVAL_STATES)[number]

/**
 * Why the state is what it is. A closed set, and these strings are POLICY
 * IDENTIFIERS: they are compared, stored and surfaced, so an unstable value —
 * a raw database error, a formatted number — must never appear here. Same rule
 * as `StopRefusalReason`.
 */
export const SURVIVAL_REASONS = [
  /** The binding scope has no headroom left. */
  'headroom_exhausted',
  /** Remaining headroom is below the critical fraction of the binding limit. */
  'headroom_critical',
  /** Remaining headroom is below the conserve fraction of the binding limit. */
  'headroom_conserve',
  /** The binding scope has ample headroom. */
  'headroom_healthy',
  /** The owner has never supplied an operating-capital figure. */
  'funding_undeclared',
  /** A funding source was expected but could not be read — a telemetry failure. */
  'funding_unavailable',
  /** Known funding is at or below zero. */
  'funding_depleted',
  /** Known funding depletes within the critical/conserve horizon. */
  'runway_short',
  /** One or more source reads failed, so the truth is not fully established. */
  'reads_unavailable',
  /** No budget is configured at all. Per `budget_reserve`, unconfigured is NOT unlimited. */
  'no_budget_configured',
] as const

export type SurvivalReason = (typeof SURVIVAL_REASONS)[number]

/**
 * Known unknowns. A gap is a statement about what this snapshot does NOT
 * establish — it is never a reassurance, and it is never silently dropped.
 * Phase 12's rule applies here: unknown stays unknown.
 */
export const SURVIVAL_GAPS = [
  /** No declared available operating capital. Runway is therefore unknown. */
  'funding_undeclared',
  /** A funding source exists but could not be read. Runway is therefore unknown. */
  'funding_unavailable',
  /** Runway in days could not be established (see `SurvivalSnapshot.runwayDays`). */
  'runway_unknown',
  /** This snapshot does not account for platform infrastructure cost. */
  'infrastructure_cost_untracked',
  /** At least one source read did not complete; the state is conservative as a result. */
  'reads_incomplete',
] as const

export type SurvivalGap = (typeof SURVIVAL_GAPS)[number]

// ─── Autonomy ceiling (Chapter 18) ──────────────────────────────────────────

/**
 * The canonical Chapter 18 autonomy levels (§18.10). Reused verbatim — this is
 * not a new enum. `lib/atlas/capability/{media-generation,desktop-commander}.ts`
 * already declare `'L0' as const` against the same vocabulary, each documented
 * as "a ceiling, not a grant"; this type simply names all seven so a ceiling
 * can be expressed and compared.
 */
export const AUTONOMY_LICENSE_LEVELS = [
  'L0', // Observe
  'L1', // Recommend
  'L2', // Prepare
  'L3', // Execute Internally
  'L4', // External Low-Risk
  'L5', // Conditional Business Autonomy
  'L6', // Full Strategic Autonomy
] as const

export type AutonomyLicenseLevel = (typeof AUTONOMY_LICENSE_LEVELS)[number]

/** §18.10's own names, for display. Never used in a comparison. */
export const AUTONOMY_LICENSE_LABELS: Record<AutonomyLicenseLevel, string> = {
  L0: 'Autonomy License L0 — Observe',
  L1: 'Autonomy License L1 — Recommend',
  L2: 'Autonomy License L2 — Prepare',
  L3: 'Autonomy License L3 — Execute Internally',
  L4: 'Autonomy License L4 — External Low-Risk',
  L5: 'Autonomy License L5 — Conditional Business Autonomy',
  L6: 'Autonomy License L6 — Full Strategic Autonomy',
}

// ─── Input ──────────────────────────────────────────────────────────────────

/**
 * One row of `budget_headroom()`, renamed to this module's casing.
 *
 * `scope` is the EXISTING `BudgetScope` union from `lib/cost/budget-gate.ts`,
 * imported as a type only — the same deliberate `import type` `execution-stop.ts`
 * uses for `ProjectRef`, erased at compile time so no runtime edge exists
 * between the survival reader and the spend gate.
 */
export interface BudgetScopeReading {
  projectId: string
  slug: string
  scope: BudgetScope
  limitSek: number
  spentSek: number
  heldSek: number
  remainingSek: number
}

/**
 * The three funding situations, as an explicit closed vocabulary.
 *
 * ── WHY THIS IS A UNION AND NOT `number | null` ─────────────────────────────
 * A single nullable number cannot distinguish "the owner never told us", "we
 * were told and lost it", and "we know it". Collapsing them is not a cosmetic
 * loss of detail — it is a SAFETY defect, because the three must be treated with
 * different severity:
 *
 *   UNDECLARED   the owner has never supplied a figure. Stable, deliberate,
 *                known-to-be-absent. Floors at CONSERVE.
 *   UNAVAILABLE  a funding source is configured or expected but could not be
 *                read. This is a TELEMETRY FAILURE, and losing information must
 *                never buy operational freedom. Floors at CRITICAL.
 *   KNOWN        a valid figure exists; runway is derivable from it.
 *
 * With `number | null` all three arrived as `null`, so a known-near-zero
 * position (CRITICAL) could be *relaxed* to the undeclared floor (CONSERVE) by
 * simply failing to read it. That is a ceiling that rises when information is
 * lost, which is the one direction this subsystem must never move.
 *
 * ── MONOTONICITY, STATED EXACTLY ────────────────────────────────────────────
 * KNOWN → UNAVAILABLE can never make the state more permissive: UNAVAILABLE
 * floors at CRITICAL, which is at least as restrictive as anything a known
 * figure can imply short of HIBERNATE, and HIBERNATE already wins over the
 * floor. A telemetry failure therefore cannot grant more than the truth could.
 *
 * UNDECLARED is NOT a telemetry failure — it is the absence of an owner
 * decision, and the floor is a policy choice (`CONSERVE`) rather than a
 * consequence of a lost reading.
 */
export const FUNDING_STATES = ['KNOWN', 'UNDECLARED', 'UNAVAILABLE'] as const
export type FundingState = (typeof FUNDING_STATES)[number]

export type FundingReading =
  | {
      kind: 'KNOWN'
      /** Declared available operating capital in SEK. May be zero or negative. */
      declaredFundingSek: number
    }
  | { kind: 'UNDECLARED' }
  | { kind: 'UNAVAILABLE' }

/**
 * Which source reads completed. A read that failed is NOT an absence of the
 * fact — it is the failure to establish it, and the two must stay distinct.
 * `derive.ts` treats any `false` as a cap toward the conservative direction.
 */
export interface SurvivalReads {
  /** `budget_headroom()` answered. */
  budgets: boolean
  /** The trailing `cost_events` burn aggregate answered. */
  burn: boolean
  /** The `revenue_snapshots` trend answered. */
  revenue: boolean
}

export interface SurvivalInput {
  /** Per-scope headroom from `budget_headroom()`. Empty means none configured. */
  scopes: BudgetScopeReading[]
  /** Which reads completed. */
  reads: SurvivalReads
  /** Trailing burn in SEK per day, or null when not established. */
  burnSekPerDay: number | null
  /**
   * The funding situation, discriminated — see `FundingReading`.
   *
   * A RUNWAY INPUT ONLY. It is not a second budget, it does not authorize any
   * spending, and it is never compared against `project_budgets` or
   * `platform_config`. §18.2: authority comes from the licence, never from a
   * funding figure.
   */
  funding: FundingReading
  /**
   * Change in MRR in SEK against the previous snapshot.
   *
   * A PERFORMANCE SIGNAL ONLY. MRR is not cash and is never treated as available
   * money anywhere in this module: it feeds no spending decision, no runway
   * figure and no headroom calculation. It is an input to EXPAND alone, which
   * Phase 1 defines as an observation.
   */
  revenueTrendSek: number | null
  /**
   * The platform's own automation pause, carried through for context.
   *
   * NOT an input to the state — `derive.ts` copies it and never branches on it.
   * An owner pause and a survival-driven reduction have different causes and
   * different remedies; folding one into the other would make §18.251's
   * "material autonomy reductions should be visible and explained" impossible
   * to satisfy, because the surface could no longer say which one happened.
   */
  operatingPaused: boolean | null
}

// ─── Output ─────────────────────────────────────────────────────────────────

export interface SurvivalSnapshot {
  state: SurvivalState
  /** Why. Closed vocabulary, ordered most-significant first. */
  reasons: SurvivalReason[]
  /** What was NOT established. Never empty merely because nothing went wrong. */
  gaps: SurvivalGap[]
  /** The scope whose remaining headroom is smallest — the tightest one decides. */
  bindingScope: BudgetScope | null
  bindingProjectId: string | null
  bindingLimitSek: number | null
  bindingRemainingSek: number | null
  burnSekPerDay: number | null
  /**
   * Which funding situation produced this snapshot. Explicit, so a reader never
   * has to infer it from a nullable number.
   */
  fundingState: FundingState
  /** The figure, present exactly when `fundingState === 'KNOWN'`. */
  declaredFundingSek: number | null
  /**
   * Days of runway at the measured burn, or `null` when not established.
   *
   * `null` means NOT ESTABLISHED and covers: undeclared funding, unreadable
   * funding, unreadable burn, or known funding with no measured burn to project
   * from. `fundingState` and `reasons`/`gaps` say which. It is NEVER estimated
   * from MRR.
   */
  runwayDays: number | null
  revenueTrendSek: number | null
  /**
   * Whether the platform's own automation pause is currently set. Reported for
   * context ONLY — it does not change the survival state. An owner pause and a
   * survival-driven reduction have different causes and different remedies, and
   * conflating them would make §18.251's "material autonomy reductions should be
   * visible and explained" impossible to satisfy.
   */
  operatingPaused: boolean | null
  /** The observation instant, from the injected clock. */
  asOf: string
}

export interface SurvivalObservation {
  snapshot: SurvivalSnapshot
  /**
   * The autonomy ceiling this state implies, in Chapter 18 terms.
   *
   * A CEILING, NOT A GRANT — the same sense in which
   * `DESKTOP_COMMANDER_AUTONOMY_LEVEL` is documented as "the ceiling Phase 0
   * asserts, not a grant". Phase 1 never applies it; nothing reads it yet.
   */
  ceiling: AutonomyLicenseLevel
}
