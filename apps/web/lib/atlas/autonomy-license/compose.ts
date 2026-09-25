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
 * `min` is the whole function. A null or absent ceiling does not raise anything:
 * it returns the licence's own resolved level, and an ineffective licence
 * contributes L0 regardless of how generous the ceiling is. Survival never
 * mutates the licence — this returns a number and writes nothing.
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
   * whatever the ceiling says.
   */
  readonly boundedBy: 'licence_ineffective' | 'licence' | 'survival_ceiling'
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
    return { licensedLevel, survivalCeiling, effectiveLevel: licensedLevel, boundedBy: 'licence' }
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
