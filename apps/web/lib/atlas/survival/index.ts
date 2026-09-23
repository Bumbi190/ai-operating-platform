/**
 * lib/atlas/survival — Atlas survival observation (Phase 1, READ-ONLY).
 *
 * ── WHAT THIS SUBSYSTEM IS ──────────────────────────────────────────────────
 * It observes the platform's economic condition and derives, from existing
 * truth, the MAXIMUM Chapter 18 autonomy level that condition permits. It grants
 * nothing, spends nothing, refuses nothing and pauses nothing.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────
 *
 *     effectiveAutonomy = min(licensedAutonomy, survivalCeiling)
 *
 * Survival pressure may only ever LOWER autonomy (§18.247, §18.274). There is no
 * code path in this subsystem that raises a level or creates authority.
 *
 * ── WHAT MUST NOT BE ADDED HERE ─────────────────────────────────────────────
 * • No grant, licence or approval. Licences belong to the authorization chain
 *   (§18.48); this subsystem only ever narrows one that already exists.
 * • No pause, stop or refusal. The stop authority is `lib/governance/*` and it
 *   has exactly one reader, `resolveExecutionStop`. Phase 1 in particular makes
 *   HIBERNATE an OBSERVATION — it pauses nothing.
 * • No reservation and no second budget. `budget_headroom()` is read; nothing is
 *   ever reserved from here.
 * • No scheduler. Atlas already has 37 `pg_cron` jobs.
 * • No funding figure inferred from MRR. Revenue is a performance signal.
 *
 * ── PHASE 1 IS INERT ────────────────────────────────────────────────────────
 * Nothing outside this directory and its route imports it. A test asserts that,
 * so the property is enforced rather than promised.
 */

export {
  SURVIVAL_STATES,
  SURVIVAL_REASONS,
  SURVIVAL_GAPS,
  FUNDING_STATES,
  AUTONOMY_LICENSE_LEVELS,
  AUTONOMY_LICENSE_LABELS,
  type SurvivalState,
  type SurvivalReason,
  type SurvivalGap,
  type SurvivalSnapshot,
  type SurvivalObservation,
  type SurvivalInput,
  type SurvivalReads,
  type BudgetScopeReading,
  type AutonomyLicenseLevel,
  type FundingState,
  type FundingReading,
} from './types'

export {
  deriveSurvivalState,
  mostRestrictive,
  PROVISIONAL_CRITICAL_HEADROOM_FRACTION,
  PROVISIONAL_CONSERVE_HEADROOM_FRACTION,
  PROVISIONAL_EXPAND_MIN_HEADROOM_FRACTION,
  PROVISIONAL_RUNWAY_CRITICAL_DAYS,
  PROVISIONAL_RUNWAY_CONSERVE_DAYS,
  PROVISIONAL_EXPAND_MIN_RUNWAY_DAYS,
  SURVIVAL_THRESHOLD_STATUS,
  PROVISIONAL_POLICY_NOTICE,
  FUNDING_UNDECLARED_FLOOR,
  FUNDING_UNAVAILABLE_FLOOR,
  FUNDING_DEPLETED_FLOOR,
  type SurvivalThresholdStatus,
  type DeriveOptions,
} from './derive'

export {
  SURVIVAL_CEILING,
  SURVIVAL_CEILING_EFFECT,
  survivalCeiling,
  effectiveAutonomy,
  lowestAutonomy,
  describeCeiling,
  allCeilings,
} from './ceiling'

export {
  readSurvivalSnapshot,
  BURN_WINDOW_DAYS,
  type SnapshotOptions,
} from './snapshot'

// Phase 2A — durable transition history. History only: nothing here is read to
// determine the CURRENT state.
export {
  SURVIVAL_EVENT_TYPES,
  SURVIVAL_DERIVATION_VERSION,
  SURVIVAL_HISTORY_DEFAULT_LIMIT,
  SURVIVAL_HISTORY_MAX_LIMIT,
  recordSurvivalTransition,
  observeProjectSurvival,
  listProjectSurvivalTransitions,
  latestProjectSurvivalEvent,
  type SurvivalStateEvent,
  type SurvivalEventType,
  type SurvivalRecordResult,
  type SurvivalRecordOutcome,
  type SurvivalHistoryReadResult,
  type SurvivalHistoryReadStatus,
} from './history'
