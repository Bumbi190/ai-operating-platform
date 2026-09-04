/**
 * lib/workflows/effect/spend-boundary.ts — who reserves, and who may.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Phase 2B-2.5 gave the executor a spend boundary that reserved `estimatedSek: 0`.
 * That was correct for a deterministic effect costing nothing and vacuous for a
 * priced one: it held no headroom and settled nothing. The gap only surfaced when
 * a real provider was wired, because the hardened Anthropic adapter takes its own
 * reservation — so one dispatch would have produced two, neither meaning much.
 *
 * The executor cannot fix that by estimating harder. A completion's cost depends
 * on the prompt, which only the handler assembles, and the reservation must be
 * taken BEFORE the request. So for a priced provider call the adapter is the only
 * party that can reserve a real amount at the right moment — and it already does
 * it correctly, with an upper-bound estimate, `provablyNotBilled` classification
 * and settle-or-release.
 *
 * What was missing was not a better executor reservation. It was the adapter
 * knowing WHICH INTENT it was spending for.
 *
 * ── THE MODEL ───────────────────────────────────────────────────────────────
 * Ownership is declared per kind, in a closed table, and it is not a licence to
 * skip spend: a FINANCIAL action still cannot dispatch without a reservation. It
 * only says which layer takes it, and a handler-owned boundary must PROVE it
 * reserved under the run's identity — the executor refuses the result otherwise.
 */

import type { GovernedEffectEnabledKind } from '../action-registry'

/**
 * `executor` — the executor reserves before calling the handler. Correct when the
 *   cost is knowable in advance, and the default posture.
 * `trusted_adapter` — a sanctioned provider adapter reserves at the moment of
 *   dispatch, under the run's identity. Deliberately NOT called `handler`: the
 *   permission belongs to a reviewed provider boundary, not to any handler that
 *   would like to opt out.
 */
export const SPEND_BOUNDARY_OWNERS = ['executor', 'trusted_adapter'] as const
export type SpendBoundaryOwner = (typeof SPEND_BOUNDARY_OWNERS)[number]

/**
 * The closed table. Keyed by the enabled-kind type, so a kind that is not on the
 * governed-effect allowlist cannot appear here, and a new enabled kind that
 * forgets to declare an owner is a TYPE ERROR rather than a silent default.
 *
 * A default would be the whole bug: whichever value made the code compile would
 * become the one nobody chose.
 */
export const SPEND_BOUNDARY_BY_KIND: Record<GovernedEffectEnabledKind, SpendBoundaryOwner> = {
  // The deterministic proof reserves at its own boundary, deliberately, so that
  // the path exercised here is the same shape a priced provider call will take.
  proof_governed_effect: 'trusted_adapter',
}

export function spendBoundaryOwnerFor(kind: string): SpendBoundaryOwner | null {
  return (SPEND_BOUNDARY_BY_KIND as Record<string, SpendBoundaryOwner>)[kind] ?? null
}

/**
 * Why a governed effect was refused over spend, before anything was attempted.
 *
 * Each value means nothing happened and nothing is owed. They are separate
 * because they are different mistakes: no owner declared is a wiring error, a
 * zero estimate is a governance error, and a missing proof of reservation means
 * the adapter did not do what its ownership claims it does.
 */
export const SPEND_BOUNDARY_REFUSALS = [
  'no_spend_owner_declared',
  'executor_estimate_missing',
  'adapter_did_not_reserve',
  'adapter_reserved_under_wrong_identity',
] as const

export type SpendBoundaryRefusal = (typeof SPEND_BOUNDARY_REFUSALS)[number]

/**
 * May an executor-owned reservation of this size proceed for this class?
 *
 * The load-bearing rule: a FINANCIAL action reserving zero is not governed
 * spend, it is the absence of it. A genuinely free action must be free by policy
 * — a class that does not require spend enforcement — never by a missing
 * estimate that happened to default to nothing.
 */
export function executorReservationIsMeaningful(
  actionClass: string, estimatedSek: number,
): boolean {
  if (actionClass !== 'FINANCIAL') return true
  return Number.isFinite(estimatedSek) && estimatedSek > 0
}
