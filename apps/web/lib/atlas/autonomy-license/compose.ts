/**
 * lib/atlas/autonomy-license/compose.ts — observation-only composition.
 *
 * Ruling 6 is the boundary this file respects on both sides:
 *
 *   "The Autonomy License is NOT a replacement for existing action authority…
 *    Later runtime composition will conceptually be: existing workflow/action
 *    authority ∩ valid Autonomy License scope ∩ licensed level ∩ Survival
 *    ceiling ∩ existing risk/spend controls. Phase 2C implements ONLY the
 *    licence truth. Do NOT wire this intersection into execution yet."
 *
 * So this module computes ONE edge of that intersection — the licence against
 * the Survival ceiling — and is deliberately inert. Nothing in an executor,
 * gate, provider, spend boundary, transition or scheduler imports it, and a test
 * asserts that absence rather than trusting this comment.
 *
 * ── WHY THE CEILING IS A PARAMETER ─────────────────────────────────────────
 * The Survival ceiling is Survival's to compute. Accepting it as an argument
 * rather than importing the module that derives it keeps this file a pure
 * function of two levels: no I/O, no session, no second opinion about what the
 * ceiling is. It also means the composition cannot become a consumer of
 * Survival's internals — the caller decides where the ceiling came from, and
 * `effectiveAutonomy` in the ceiling module stays the single rule for what a
 * ceiling means.
 *
 * ── SURVIVAL CAN ONLY LOWER ────────────────────────────────────────────────
 * `min` is the whole function, and BOTH inputs fail closed. An ineffective
 * licence contributes L0 whatever the ceiling says. An UNAVAILABLE ceiling
 * (null) also contributes L0 — see below; it does not hand the licence back
 * unmodified. Survival never mutates the licence — this returns a number and
 * writes nothing.
 *
 * ── A NULL CEILING IS NOT "NO OPINION", IT IS L0 ───────────────────────────
 * This file previously returned the licence's own level when the ceiling was
 * null, on the reasoning that "a null ceiling does not raise anything". That is
 * true and was insufficient: it also did not RESTRICT. Survival's whole
 * discipline is that losing a reading must never buy operational freedom — its
 * own funding branch floors a failed read at HIBERNATE for exactly that reason
 * — and a null ceiling here meant an unreadable platform condition produced the
 * FULL licensed level. It was the one place in the survival composition that
 * moved the wrong way.
 *
 * So null resolves to `ineffective`, not to "no opinion", and `boundedBy`
 * reports `survival_unavailable` rather than `survival_ceiling`: an operator
 * reading the audit trail must be able to tell "the ceiling was computed and
 * bound" from "the ceiling could not be computed". Reusing `survival_ceiling`
 * for both would hide the failure.
 */

import { compareLevels, INEFFECTIVE_LEVEL } from './levels'
import type { AutonomyLicenseLevel } from './levels'
import type { ResolvedAutonomyLicense } from './types'

export interface EffectiveAutonomyObservation {
  /** What the licence alone permits, after every derived ineffectiveness. */
  readonly licensedLevel: AutonomyLicenseLevel
  /** What Survival allows, or null when Survival has expressed no opinion. */
  readonly survivalCeiling: AutonomyLicenseLevel | null
  /** `min(licensed, ceiling)`. Never above either input. */
  readonly effectiveLevel: AutonomyLicenseLevel
  /**
   * Which input decided the answer — the audit question "why is this L2?".
   * `licence_ineffective` outranks everything: an ineffective licence is L0
   * whatever the ceiling says. `survival_unavailable` means the ceiling could
   * not be computed and L0 was imposed for that reason — deliberately distinct
   * from `survival_ceiling`, which means a ceiling WAS computed and bound.
   */
  readonly boundedBy: 'licence_ineffective' | 'licence' | 'survival_ceiling' | 'survival_unavailable'
}

/**
 * Observe the effective autonomy of a resolved licence under a ceiling.
 *
 * PURE and INERT. It exists so the composition rule can be stated once, tested
 * exhaustively, and reviewed before anything is allowed to depend on it.
 */
export function observeEffectiveAutonomy(
  license: ResolvedAutonomyLicense,
  survivalCeiling: AutonomyLicenseLevel | null,
): EffectiveAutonomyObservation {
  const licensedLevel = license.resolvedLevel

  if (!license.effective || licensedLevel === INEFFECTIVE_LEVEL) {
    return {
      licensedLevel,
      survivalCeiling,
      effectiveLevel: INEFFECTIVE_LEVEL,
      boundedBy: 'licence_ineffective',
    }
  }

  if (survivalCeiling === null) {
    // An unreadable ceiling is NOT "no opinion". Failing open here would let a
    // broken survival read hand back the full licensed level, which is the one
    // direction this composition must never move.
    return {
      licensedLevel,
      survivalCeiling,
      effectiveLevel: INEFFECTIVE_LEVEL,
      boundedBy: 'survival_unavailable',
    }
  }

  // Negative when the ceiling is BELOW the licence, which is the only direction
  // Survival is allowed to move it.
  const ceilingBinds = compareLevels(survivalCeiling, licensedLevel) < 0
  return {
    licensedLevel,
    survivalCeiling,
    effectiveLevel: ceilingBinds ? survivalCeiling : licensedLevel,
    boundedBy: ceilingBinds ? 'survival_ceiling' : 'licence',
  }
}
