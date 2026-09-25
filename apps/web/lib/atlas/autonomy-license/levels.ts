/**
 * lib/atlas/autonomy-license/levels.ts — the ONE canonical Chapter 18 autonomy
 * level vocabulary.
 *
 * §18.10 defines the levels; Chapter 18 Autonomy Licensing owns them. Survival
 * is one CONSUMER of this scale (its ceiling narrows autonomy, it does not
 * define what autonomy is), so the declaration lives here and Survival imports
 * it. Before the Phase 2C vocabulary ruling it lived in the Survival module and
 * this module imported it, which had the ownership backwards.
 *
 * ── LEAF MODULE, DELIBERATELY ──────────────────────────────────────────────
 * This file imports NOTHING. Not Survival, not Authorization, not Mission,
 * Delegation or Work Package, not the workflow runtime, not the database, not
 * `server-only`, not auth. A vocabulary that depends on a subsystem is a
 * vocabulary that subsystem can bend, and §18.10's seven levels are the one
 * thing every part of the licensing contract compares against.
 *
 * ── THE THREE SCALES STAY UNRELATED ────────────────────────────────────────
 * These levels are Chapter 18 autonomy. They are NOT Mission Risk Level (0–3)
 * and NOT `MissionRecord.risks` (low/medium/high). `docs/autonomy/
 * RISK-AND-AUTHORITY.md` §0: "The two numbers are unrelated and must never be
 * compared or added." Nothing from either risk vocabulary appears here, and a
 * test asserts that.
 *
 * ── THE DECLARATION IS MOVED VERBATIM ──────────────────────────────────────
 * §18.10's own names, the array order, and the labels are unchanged from their
 * previous home. A second L0–L6 enum anywhere would make "is this licence for
 * L4?" a question with two answers, which is exactly what the licensing
 * contract cannot survive.
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

/**
 * Non-throwing membership test, for UNTRUSTED input.
 *
 * `levelIndex` below deliberately throws: calling it with something that is not
 * a level is an internal impossibility, and an exception is the right response
 * to a broken invariant. Caller input is the opposite case. A licence request
 * may carry anything at all, and an unrecognised level must become a REFUSAL
 * (`{ ok: false, reason: 'invalid_level' }`) — never an exception escaping the
 * licensing boundary as a 500.
 *
 * Derived from `AUTONOMY_LICENSE_LEVELS` rather than a second literal list, so
 * it cannot drift from the vocabulary it guards.
 */
export function isAutonomyLicenseLevel(value: unknown): value is AutonomyLicenseLevel {
  return typeof value === 'string' && (AUTONOMY_LICENSE_LEVELS as readonly string[]).includes(value)
}

// ── Ordering helpers ──────────────────────────────────────────────────────────
//
// Owned here because ordering IS a property of the level scale. Survival's
// ceiling arithmetic (`SURVIVAL_CEILING`, `survivalCeiling`, `effectiveAutonomy`,
// `lowestAutonomy`) stays in Survival — that is Survival's mapping from a
// survival state to a permitted level, which is a different question from what
// the levels are.

/**
 * Ordinal position. The ONLY place a Chapter 18 level becomes a number.
 *
 * Derived from the canonical array rather than a second hand-written table: a
 * literal `{ L0: 0, … }` would be a second declaration of the same fact, and
 * adding an L7 would then leave this ordering silently missing an entry.
 */
export function levelIndex(level: AutonomyLicenseLevel): number {
  const index = AUTONOMY_LICENSE_LEVELS.indexOf(level)
  if (index === -1) throw new Error(`[autonomy-license] unknown level ${level}`)
  return index
}

/**
 * Compare two Chapter 18 levels. Negative when `a` is LESS autonomy.
 *
 * Deliberately typed to this vocabulary alone: Chapter 18's levels and the
 * Mission Risk Level scale are unrelated axes, and a generic `compare(a, b)`
 * would let one be passed where the other belongs.
 */
export function compareLevels(a: AutonomyLicenseLevel, b: AutonomyLicenseLevel): number {
  return levelIndex(a) - levelIndex(b)
}

/** The level a licence resolves to whenever it is not effective (§18.272). */
export const INEFFECTIVE_LEVEL: AutonomyLicenseLevel = 'L0'
