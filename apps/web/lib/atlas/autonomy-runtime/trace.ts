/**
 * lib/atlas/autonomy-runtime/trace.ts — the durable autonomy decision trace.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────
 * The READ model for `run_autonomy_decisions`: what the autonomy layer
 * concluded, for one durable run, at one execution boundary, using which
 * resolved licence and which Survival observation.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 * It is EVIDENCE, not authority. It authorizes nothing, is consulted by nothing,
 * and the whole phase is inert without it. Three deliberate absences:
 *
 *   • NO WRITER. There is no `append` here. The only path that can create a row
 *     is the `record_run_autonomy_decision` RPC, which locks the run row and
 *     refuses `bind` — bind provenance is created atomically with the run by the
 *     Phase 3B1B bind RPC, and a generic writer able to append `bind` after the
 *     fact would reopen exactly the non-atomic path that phase exists to close.
 *   • NO OUTCOME COLUMN. The table stores `reason`; whether that reason is
 *     permissive or a refusal is DERIVED here. Storing both would be two copies
 *     of one fact that can disagree.
 *   • NO EXECUTION IMPORTS. Nothing under `lib/workflows/**` imports this file,
 *     and this file imports nothing from there. A permanent guard proves it:
 *     the moment execution depends on the trace, the trace has become a runtime
 *     input rather than a record of one.
 *
 * ── WHY THE COLUMNS ARE EXPORTED ────────────────────────────────────────────
 * So the SQL suite can assert the migration's column set against THIS list
 * rather than a regex over the migration text. Two hand-maintained lists drift;
 * one list and a contract test cannot.
 */

export const RUN_AUTONOMY_DECISION_COLS = [
  'event_id',
  'event_seq',
  'run_id',
  'boundary',
  'claim_id',
  'policy_mode',
  'policy_reason',
  'reason',
  'license_id',
  'license_generation',
  'license_reason',
  'required_level',
  'effective_level',
  'survival_state',
  'survival_ceiling',
  'survival_reason',
  'bounded_by',
  'license_resolved_at',
  'survival_as_of',
  'occurred_at',
] as const

export type RunAutonomyDecisionCol = (typeof RUN_AUTONOMY_DECISION_COLS)[number]

/**
 * The runtime boundaries a durable run can reach.
 *
 * `bind` records the admission taken BEFORE the run exists, so a refused bind
 * creates no run and therefore no row — which is why `bind` can only ever carry
 * a permissive reason. The other two are claimed execution boundaries.
 */
export const AUTONOMY_TRACE_BOUNDARIES = ['bind', 'readiness', 'pre_dispatch'] as const
export type AutonomyTraceBoundary = (typeof AUTONOMY_TRACE_BOUNDARIES)[number]

/** The boundaries the claimed-execution writer may append. `bind` is excluded. */
export const CLAIMED_EXECUTION_BOUNDARIES = ['readiness', 'pre_dispatch'] as const

export const AUTONOMY_POLICY_MODES = [
  'license_exempt_observation', 'licensed', 'unsupported',
] as const
export type AutonomyPolicyMode = (typeof AUTONOMY_POLICY_MODES)[number]

export const AUTONOMY_ADMISSION_REASONS = [
  'exempt_observation',
  'allowed',
  'unsupported_action',
  'licence_not_effective',
  'action_not_in_licence_scope',
  'effective_level_below_required',
] as const
export type AutonomyAdmissionReason = (typeof AUTONOMY_ADMISSION_REASONS)[number]

export const AUTONOMY_POLICY_REASONS = [
  'canonical_read_only_observation', 'v1_scope_incomplete', 'not_executable',
] as const

export const AUTONOMY_SURVIVAL_REASONS = [
  'population_unavailable', 'snapshot_unavailable',
] as const

export const AUTONOMY_BOUNDED_BY = [
  'licence', 'survival_ceiling', 'survival_unavailable',
] as const

/**
 * Is this reason a PERMISSIVE outcome?
 *
 * The derived stand-in for the `verdict` column that deliberately does not
 * exist. Exhaustive over the closed vocabulary and closed at the default: an
 * unrecognised reason is NOT permissive. A permissive default would turn a
 * future vocabulary addition into a silent grant.
 */
export function isPermissiveReason(reason: string): boolean {
  return reason === 'exempt_observation' || reason === 'allowed'
}

/** One row of the ledger, exactly as stored. */
export interface RunAutonomyDecisionRow {
  readonly event_id: string
  readonly event_seq: number
  readonly run_id: string
  readonly boundary: AutonomyTraceBoundary
  readonly claim_id: string | null
  readonly policy_mode: AutonomyPolicyMode
  readonly policy_reason: string | null
  readonly reason: AutonomyAdmissionReason
  readonly license_id: string | null
  readonly license_generation: number | null
  readonly license_reason: string | null
  readonly required_level: string | null
  readonly effective_level: string | null
  readonly survival_state: string | null
  readonly survival_ceiling: string | null
  readonly survival_reason: string | null
  readonly bounded_by: string | null
  readonly license_resolved_at: string | null
  readonly survival_as_of: string | null
  readonly occurred_at: string
}

/** A decision, with the derived outcome made explicit for readers. */
export interface RunAutonomyDecision extends RunAutonomyDecisionRow {
  /** Derived from `reason`. Never stored. */
  readonly permissive: boolean
}

/**
 * Map a stored row to the reader-facing shape.
 *
 * PURE. `permissive` is computed, never read — so a row can never disagree with
 * itself about its own outcome.
 */
export function toRunAutonomyDecision(row: RunAutonomyDecisionRow): RunAutonomyDecision {
  return { ...row, permissive: isPermissiveReason(row.reason) }
}

/**
 * Was the Survival ceiling OBSERVED, or did it fail closed?
 *
 * The distinction the whole `bounded_by` column exists for: "Survival observed
 * HIBERNATE, so L0" and "Survival could not be established, so autonomy failed
 * closed to L0" are different facts with different operator responses.
 */
export function isSurvivalUnavailable(row: RunAutonomyDecisionRow): boolean {
  return row.bounded_by === 'survival_unavailable'
}

/**
 * Why is there no autonomy record for this run?
 *
 * The honest answer for any run created before this table existed — which is
 * EVERY run in production today — is `not_recorded`.
 *
 * This exists as a named function so no reader can express it as a boolean
 * `hasTrace` and then treat its absence as permissive. "We never recorded one"
 * is not "it was exempt", not "it was allowed", and not "it was licensed".
 */
export type AutonomyTraceAbsence = 'not_recorded'

export function describeTraceAbsence(rows: readonly unknown[]): AutonomyTraceAbsence | null {
  return rows.length === 0 ? 'not_recorded' : null
}
