/**
 * lib/atlas/survival/ceiling.ts — survival state → autonomy ceiling (pure).
 *
 * ── WHAT THIS COMPUTES ──────────────────────────────────────────────────────
 * A single number per survival state: the MAXIMUM Chapter 18 autonomy level that
 * condition permits. Nothing here grants, widens or authorizes.
 *
 *   effectiveAutonomy = min(licensedAutonomy, survivalCeiling(state))
 *
 * `min` is over `AUTONOMY_LICENSE_LEVELS` order, so L0 < L3 < L6. Because the
 * ceiling for EXPAND/NORMAL is L6 — the maximum — those two states apply NO
 * additional restriction, and `effectiveAutonomy` returns the licensed level
 * unchanged. Every other state returns something strictly lower whenever the
 * licence was above it.
 *
 * The whole module is 40 lines of table because that is the point: there is no
 * branch through it that raises a level, and a reader can verify that by looking
 * at the table rather than by tracing control flow.
 *
 * ── WHERE THE LEVELS COME FROM ──────────────────────────────────────────────
 * The five states are mapped onto Chapter 18's own `fallback level` examples
 * (§18.42), so no new vocabulary is invented:
 *
 *   §18.42  "L4 → L2: Stop publishing, continue drafting."
 *   §18.42  "L5 → L3: Stop external action, continue internal operation."
 *   §18.42  "L3 → L1: Stop execution, continue recommendation."
 *   §18.42  "Any level → L0: Observe only."
 *
 * CONSERVE, CRITICAL and HIBERNATE are the "stop external action", "stop
 * execution" and "observe only" rows. EXPAND and NORMAL assert no fallback at
 * all, which is why both are L6.
 *
 * §18.34 ("Time Scope") already contemplates "Not during Crisis Mode", and
 * §18.173 has Crisis Mode "reduce active levels" — this module is the arithmetic
 * those sections describe.
 *
 * ── WHAT THIS MUST NEVER DO ─────────────────────────────────────────────────
 * Return a level above the one it was given. `effectiveAutonomy` is total over
 * its inputs and monotone: raising the licensed level never lowers the result,
 * and lowering the ceiling never raises it. A test proves the direction for
 * every (licensed, state) pair rather than sampling.
 */

import {
  AUTONOMY_LICENSE_LEVELS,
  AUTONOMY_LICENSE_LABELS,
  SURVIVAL_STATES,
  type AutonomyLicenseLevel,
  type SurvivalState,
} from './types'

import { INEFFECTIVE_LEVEL, isAutonomyLicenseLevel } from '@/lib/atlas/autonomy-license/levels'

/**
 * The ceiling each survival state implies.
 *
 * Read as "at most this". EXPAND and NORMAL deliberately map to L6 rather than
 * being special-cased, so the table stays total and the meet stays uniform.
 *
 * FROZEN, and read only through `survivalCeiling()`. The declared type is total,
 * but a plain object literal is NOT total at runtime: it inherits
 * `Object.prototype`, so `SURVIVAL_CEILING['constructor']` answers `Object` and
 * `['toString']` answers a function. The accessor below is what makes those
 * fail closed; freezing stops them being installable in the first place.
 */
export const SURVIVAL_CEILING: Record<SurvivalState, AutonomyLicenseLevel> = Object.freeze({
  EXPAND: 'L6',
  NORMAL: 'L6',
  CONSERVE: 'L3',
  CRITICAL: 'L1',
  HIBERNATE: 'L0',
})

/** Position in §18.10's order. L0 = 0 … L6 = 6. */
const LEVEL_INDEX: Record<AutonomyLicenseLevel, number> = Object.freeze(
  AUTONOMY_LICENSE_LEVELS.reduce(
    (acc, level, index) => Object.assign(acc, { [level]: index }),
    {} as Record<AutonomyLicenseLevel, number>,
  ),
)

/**
 * The lower of two Chapter 18 levels. Never raises either operand.
 *
 * Fail-closed on a non-level: if EITHER argument is not a canonical L0–L6 level
 * the answer is L0, not the other operand. The comparison below would otherwise
 * fall through — `LEVEL_INDEX[undefined]` is `undefined`, and `6 <= undefined`
 * is `false`, so it returns `b`, i.e. the UNRECOGNISED value is handed back as
 * if it were a level.
 */
export function lowestAutonomy(
  a: AutonomyLicenseLevel,
  b: AutonomyLicenseLevel,
): AutonomyLicenseLevel {
  if (!isAutonomyLicenseLevel(a) || !isAutonomyLicenseLevel(b)) return INEFFECTIVE_LEVEL
  return LEVEL_INDEX[a] <= LEVEL_INDEX[b] ? a : b
}

/**
 * The ceiling a survival state implies. A ceiling only — it grants nothing.
 *
 * Runtime-total by an OWN-PROPERTY check, deliberately not by an ordinary
 * lookup. `state` is typed to the five-value vocabulary so every internal call
 * is already safe, but the guard is what makes a hostile or corrupted string
 * fail closed instead of answering from `Object.prototype` or returning
 * `undefined`. `"constructor"`, `"toString"` and `"NOT_A_STATE"` all answer L0.
 *
 * L0 is the correct failure: it is the most restrictive level, so an
 * unrecognised survival state can never widen autonomy.
 */
export function survivalCeiling(state: SurvivalState): AutonomyLicenseLevel {
  if (!Object.prototype.hasOwnProperty.call(SURVIVAL_CEILING, state)) {
    return INEFFECTIVE_LEVEL
  }
  return SURVIVAL_CEILING[state]
}

/**
 * The autonomy a component may actually exercise: the lower of what it was
 * LICENSED and what the platform's condition currently permits.
 *
 * `licensedAutonomy` must come from an owner-issued licence (the authorization
 * chain). Passing anything else would be using this function to derive authority
 * from a derived value, which §18.247 forbids.
 */
export function effectiveAutonomy(
  licensedAutonomy: AutonomyLicenseLevel,
  state: SurvivalState,
): AutonomyLicenseLevel {
  return lowestAutonomy(licensedAutonomy, survivalCeiling(state))
}

/**
 * §18.42's own description of what a fallback does, for display next to the
 * level. Prose for an operator to read — never an input to a decision.
 */
export const SURVIVAL_CEILING_EFFECT: Record<SurvivalState, string> = {
  EXPAND: 'No additional restriction; the licensed level applies.',
  NORMAL: 'No additional restriction; the licensed level applies.',
  CONSERVE: 'Stop external action, continue internal operation (§18.42, L5 → L3).',
  CRITICAL: 'Stop execution, continue recommendation (§18.42, L3 → L1).',
  HIBERNATE: 'Observe only (§18.42, any level → L0).',
}

/**
 * A one-line, fully qualified description. Always names the scale, per
 * `RISK-AND-AUTHORITY.md` §0: a bare "L3" is ambiguous with Mission Risk
 * Level 3 and must never be printed that way.
 */
export function describeCeiling(state: SurvivalState): string {
  return AUTONOMY_LICENSE_LABELS[survivalCeiling(state)]
}

/** Every state's ceiling, for a surface that shows all five. */
export function allCeilings(): Record<SurvivalState, AutonomyLicenseLevel> {
  return SURVIVAL_STATES.reduce(
    (acc, state) => Object.assign(acc, { [state]: SURVIVAL_CEILING[state] }),
    {} as Record<SurvivalState, AutonomyLicenseLevel>,
  )
}
