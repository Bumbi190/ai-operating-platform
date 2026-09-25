/**
 * lib/atlas/autonomy-runtime/admission.ts — the PURE autonomy admission core.
 *
 * ── WHAT THIS IS ────────────────────────────────────────────────────────────
 * One pure evaluation of already-established facts. It answers exactly one
 * question:
 *
 *     "does the autonomy layer add a refusal?"
 *
 * It is NOT an authorization. `allowed: true` does NOT mean the action may run.
 * Every existing control remains separately mandatory and is evaluated
 * elsewhere: canonical ActionKind, ActionClass, executor-family allowlist,
 * workflow placement, project state, stop authority, evidence and target rules,
 * capability boundaries, and the budget authority. The runtime composition is
 * the INTERSECTION of all of them (§18.116: "An active license is evidence of
 * authority. It is not a bypass around policy evaluation.").
 *
 * ── IMPORTS NOTHING IMPURE, BY CONSTRUCTION ─────────────────────────────────
 * No database, no env, no session, no clock, no provider, no network. It does
 * not even import the Survival reader — the caller establishes the ceiling and
 * passes the RESULT in. That is what makes it exhaustively testable and what
 * stops it becoming a second source of truth about the platform's condition.
 *
 * ── WHY THE POLICY IS LOOKED UP, NOT PASSED IN ──────────────────────────────
 * The Phase 3B0 brief sketched `policy` as an input. It is looked up from the
 * closed table instead: a caller-supplied policy is a caller-supplied
 * permission, and the one thing this module must never offer is a way to widen
 * an action's autonomy terms by argument. The table is pure data with no I/O,
 * so nothing is lost by resolving it here.
 *
 * ── THE ORDER IS LOAD-BEARING ───────────────────────────────────────────────
 * For a `licensed` action the checks run in this order, and the order is not
 * cosmetic:
 *
 *   1. licence.effective === true
 *   2. actionKind ∈ licence.allowedActionKinds
 *   3. compose(licensed level, survival ceiling)      → needs 1
 *   4. effectiveLevel >= requiredLevel
 *
 * `effective` MUST be checked before scope membership. An expired, suspended,
 * revoked, superseded or drifted licence RETAINS its historical
 * `allowedActionKinds` — `resolveAutonomyLicense` returns the derived state
 * verbatim on those paths — so a naive
 * `allowedActionKinds.includes(kind)` would over-permit on exactly the licences
 * that are no longer in force. There is a permanent regression for this.
 */

import { compareLevels, isAutonomyLicenseLevel, type AutonomyLicenseLevel }
  from '@/lib/atlas/autonomy-license/levels'
import type { ResolvedAutonomyLicense, LicenseReason } from '@/lib/atlas/autonomy-license/types'
import { observeEffectiveAutonomy } from '@/lib/atlas/autonomy-license/compose'
import { autonomyPolicyFor, type UnsupportedReason } from './policy'

/**
 * Why the autonomy layer refused — or that it did not. Closed, so every outcome
 * is explainable and a caller cannot invent a reason.
 *
 * `exempt_observation` and `allowed` are the two permissive answers, and they
 * are deliberately DISTINCT: an exempt observation carries no licence at all,
 * while `allowed` records that a specific licence was checked and satisfied.
 * Collapsing them would let an exempt action be reported as licensed.
 */
export type AutonomyAdmissionReason =
  | 'exempt_observation'
  | 'allowed'
  | 'unknown_action_kind'
  | 'unsupported_action'
  | 'licence_absent'
  | 'licence_not_effective'
  | 'action_not_in_licence_scope'
  | 'effective_level_below_required'

export interface AutonomyAdmissionInput {
  /** The canonical ActionKind the action would perform. */
  readonly actionKind: string
  /**
   * The resolved licence, or `null` when no licence exists for the workflow
   * instance at all. `null` is NOT the same as an ineffective licence in the
   * audit trail, so it is reported with its own reason.
   */
  readonly licence: ResolvedAutonomyLicense | null
  /**
   * The Survival ceiling, or `null` when Survival has no usable answer.
   *
   * `null` composes to L0 — see `compose.ts`. It never means "no opinion".
   */
  readonly survivalCeiling: AutonomyLicenseLevel | null
}

export interface AutonomyAdmissionResult {
  /**
   * The autonomy layer adds NO refusal.
   *
   * This is the whole meaning. It does not authorize anything, and it is not a
   * substitute for any other control.
   */
  readonly allowed: boolean
  readonly reason: AutonomyAdmissionReason
  /** True only when a licence was actually required and consulted. */
  readonly licenceRequired: boolean
  /** The level this kind requires. `null` for exempt and unsupported kinds. */
  readonly requiredLevel: AutonomyLicenseLevel | null
  /** What the licence alone permits, when one was consulted. */
  readonly licensedLevel: AutonomyLicenseLevel | null
  readonly survivalCeiling: AutonomyLicenseLevel | null
  /** `min(licensed, ceiling)` after every fail-closed rule. `null` when exempt. */
  readonly effectiveLevel: AutonomyLicenseLevel | null
  /** Which input decided `effectiveLevel` — the audit question "why L2?". */
  readonly boundedBy: 'licence_ineffective' | 'licence' | 'survival_ceiling' | 'survival_unavailable' | null
  /** The licence's own reason code, when one was consulted. */
  readonly licenceReason: LicenseReason | null
  /** Present only for `unsupported_action`. */
  readonly unsupportedReason?: UnsupportedReason
}

/** The autonomy layer adds no refusal, for a kind that needs no licence. */
function exemptResult(kind: string): AutonomyAdmissionResult {
  const policy = autonomyPolicyFor(kind)
  return {
    allowed: true,
    reason: 'exempt_observation',
    // Explicitly false. An exempt observation is NOT licensed, and no caller
    // may read this outcome as a grant.
    licenceRequired: false,
    requiredLevel: policy && policy.mode === 'license_exempt_observation' ? policy.minimumLevel : 'L0',
    licensedLevel: null,
    survivalCeiling: null,
    effectiveLevel: null,
    boundedBy: null,
    licenceReason: null,
  }
}

/** A refusal that consults no licence. */
function refuse(
  reason: AutonomyAdmissionReason,
  extra: Partial<AutonomyAdmissionResult> = {},
): AutonomyAdmissionResult {
  return {
    allowed: false,
    reason,
    licenceRequired: false,
    requiredLevel: null,
    licensedLevel: null,
    survivalCeiling: null,
    effectiveLevel: null,
    boundedBy: null,
    licenceReason: null,
    ...extra,
  }
}

/**
 * Evaluate one action kind against one licence and one Survival ceiling.
 *
 * PURE. Deterministic. No I/O of any kind.
 */
export function admitAutonomyAction(input: AutonomyAdmissionInput): AutonomyAdmissionResult {
  const policy = autonomyPolicyFor(input.actionKind)

  // 0) Not a canonical kind at all. Refused before anything else, because an
  //    action with no policy has no autonomy terms to evaluate.
  if (!policy) {
    return refuse('unknown_action_kind')
  }

  // ── unsupported ───────────────────────────────────────────────────────────
  // Refused BEFORE any licence is consulted, so no level can compensate for a
  // missing scope dimension. An effective L6 licence whose allowedActionKinds
  // names this kind, under an EXPAND ceiling, still refuses here.
  if (policy.mode === 'unsupported') {
    return refuse('unsupported_action', { unsupportedReason: policy.unsupportedReason })
  }

  // ── licence-exempt observation ────────────────────────────────────────────
  // No licence refusal. The licence — absent, expired, suspended or revoked —
  // is not consulted, because the Autonomy License is not the authority
  // governing these observations. Every OTHER control still applies when the
  // runtime wiring happens.
  if (policy.mode === 'license_exempt_observation') {
    return exemptResult(input.actionKind)
  }

  // ── licensed ──────────────────────────────────────────────────────────────
  const requiredLevel = policy.minimumLevel

  // 1) An effective licence is required FIRST.
  if (!input.licence) {
    return refuse('licence_absent', { licenceRequired: true, requiredLevel })
  }
  if (!input.licence.effective) {
    // Deliberately does NOT consult allowedActionKinds. An ineffective licence
    // keeps its historical scope, so reading scope here would over-permit.
    return refuse('licence_not_effective', {
      licenceRequired: true,
      requiredLevel,
      licensedLevel: input.licence.resolvedLevel,
      licenceReason: input.licence.reason,
    })
  }

  // 2) …then the kind must actually be in the licence's scope.
  if (!input.licence.allowedActionKinds.includes(input.actionKind)) {
    return refuse('action_not_in_licence_scope', {
      licenceRequired: true,
      requiredLevel,
      licensedLevel: input.licence.resolvedLevel,
      licenceReason: input.licence.reason,
    })
  }

  // 3) Compose the licensed level with the Survival ceiling. The composition
  //    itself fails closed: a null ceiling is L0, not "no opinion".
  const composed = observeEffectiveAutonomy(input.licence, input.survivalCeiling)

  // 4) …and the effective level must reach this kind's requirement. A level is
  //    NECESSARY here but never sufficient on its own: steps 1–2 already ran.
  const satisfied = levelAtLeast(composed.effectiveLevel, requiredLevel)

  return {
    allowed: satisfied,
    reason: satisfied ? 'allowed' : 'effective_level_below_required',
    licenceRequired: true,
    requiredLevel,
    licensedLevel: composed.licensedLevel,
    survivalCeiling: composed.survivalCeiling,
    effectiveLevel: composed.effectiveLevel,
    boundedBy: composed.boundedBy,
    licenceReason: input.licence.reason,
  }
}

/**
 * `a >= b` over the Chapter 18 scale.
 *
 * Uses the CANONICAL ordering. `levels.ts` owns both the vocabulary and its
 * order; a second literal `['L0' … 'L6']` here would be a second declaration of
 * the same fact, and adding an L7 would leave this comparison silently missing
 * an entry — the exact drift the single-vocabulary invariant forbids.
 *
 * Guarded before comparing because `compareLevels`/`levelIndex` deliberately
 * THROW on a non-level: that is the right response to a broken internal
 * invariant, but a refusal path must never raise. Both values here have already
 * been validated by the composition, so the guard is defence in depth.
 */
function levelAtLeast(a: AutonomyLicenseLevel, b: AutonomyLicenseLevel): boolean {
  if (!isAutonomyLicenseLevel(a) || !isAutonomyLicenseLevel(b)) return false // unknown on either side → refuses
  return compareLevels(a, b) >= 0
}
