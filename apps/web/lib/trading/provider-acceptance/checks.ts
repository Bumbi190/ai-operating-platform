/**
 * Omnira Trading — the Level-1 acceptance invariants, as pure functions.
 *
 * WHY THESE ARE FUNCTIONS AND NOT ASSERTIONS
 * ──────────────────────────────────────────
 * The invariants are the valuable part of an acceptance harness, and assertions
 * buried inside `it(...)` blocks cannot be reused, unit-tested, or reasoned
 * about on their own. Everything load-bearing therefore lives here as a pure
 * predicate over contract values, and `acceptance-suite.ts` is a thin driver
 * that asserts on them.
 *
 * That split also gives the negative controls something real to bite: mutating
 * a rule here turns the suite red for a reason a reviewer can point at.
 *
 * NOTHING HERE COLLAPSES A THREE-STATE READING
 * ────────────────────────────────────────────
 * No function in this file maps `UNAVAILABLE` or `UNKNOWN` onto `null`, `[]`,
 * `0`, `false` or `''`. Where a reading has to be inspected, it is returned as
 * a three-state value that still says which of the two absences it was — the
 * distinction the contract exists to carry (v1.2 §5, F1.2).
 */

import type { Decimal } from '../decimal'
import type {
  Available,
  CapabilityState,
  PositionSnapshot,
  Result,
} from '../provider'
import { satisfiesSafetyCriticalRequirement } from '../provider'

// ─── Capability semantics (v1.2 §3) ───────────────────────────────────────────

/**
 * Whether a declared capability satisfies a SAFETY-CRITICAL requirement.
 *
 * Delegates to the contract's own rule rather than restating it: only
 * `SUPPORTED` qualifies, and `CONDITIONAL` / `UNKNOWN` fail closed. A harness
 * that re-implemented this could drift from the contract it is certifying.
 */
export function meetsSafetyCriticalRequirement(state: CapabilityState): boolean {
  return satisfiesSafetyCriticalRequirement(state)
}

/**
 * What the suite is entitled to DEMAND of a capability.
 *
 * `SUPPORTED`   — the provider claimed it works, so data is required.
 * everything else — only honest reporting is required.
 *
 * Four states in, two obligations out, and the mapping is total. This is the
 * one place the four-state vocabulary is reduced, and it is reduced to an
 * OBLIGATION rather than to a boolean about the capability itself — the states
 * remain four everywhere they are reported.
 */
export const CAPABILITY_OBLIGATIONS = ['MUST_PROVIDE_DATA', 'MUST_REPORT_HONESTLY'] as const
export type CapabilityObligation = (typeof CAPABILITY_OBLIGATIONS)[number]

export function obligationFor(state: CapabilityState): CapabilityObligation {
  return meetsSafetyCriticalRequirement(state) ? 'MUST_PROVIDE_DATA' : 'MUST_REPORT_HONESTLY'
}

// ─── Available semantics (v1.2 §5) ────────────────────────────────────────────

/**
 * A reading, inspected without being collapsed.
 *
 * Deliberately NOT `T | null`: mapping both absences onto one value is the
 * exact substitution §5 forbids, and a harness that did it could not tell
 * "the provider has no value" from "the provider was not asked".
 */
export type ExactReading =
  | { readonly state: 'PRESENT'; readonly text: string }
  | { readonly state: 'UNAVAILABLE' }
  | { readonly state: 'UNKNOWN' }

/**
 * Read a provider decimal as exact TEXT, never as a number.
 *
 * `Decimal.text` is the canonical normalized form. No `Number()`, `parseFloat`,
 * `parseInt` or unary plus appears on this path, because every one of them
 * corrupts values the contract accepts: `Number('99999999999999999')` is
 * `100000000000000000`, and `Number('0.000000000001')` is `1e-12`, which the
 * canonical parser then rejects.
 */
export function exactReading(value: Available<Decimal>): ExactReading {
  switch (value.state) {
    case 'PRESENT':
      return { state: 'PRESENT', text: value.value.text }
    case 'UNAVAILABLE':
      return { state: 'UNAVAILABLE' }
    case 'UNKNOWN':
      return { state: 'UNKNOWN' }
    default: {
      const exhaustive: never = value
      return exhaustive
    }
  }
}

/** The three states, preserved. Used to assert a mapping kept them distinct. */
export function availabilityOf<T>(value: Available<T>): Available<T>['state'] {
  return value.state
}

// ─── Known flat (v1.2 F10) ────────────────────────────────────────────────────

/**
 * KNOWN FLAT — the single most load-bearing invariant in the contract.
 *
 *     successful result + empty array  =  known flat
 *     failed result                    ≠  known flat
 *
 * Known flat is a POSITIVE claim: the provider was reached and reported no
 * exposure. A failure has no standing to make it — "we could not find out" is
 * not "there is nothing there" — and collapsing the second into the first is
 * the most dangerous silent translation available in this domain.
 *
 * There is deliberately no counterpart that treats an empty failure as flat,
 * and `ok: false` short-circuits before the array is ever consulted.
 */
export function isKnownFlat(result: Result<readonly PositionSnapshot[]>): boolean {
  if (!result.ok) return false
  return result.value.length === 0
}

/**
 * Whether a result honestly reports an inability rather than an emptiness.
 *
 * The mirror of `isKnownFlat`, stated separately so a test can assert both
 * directions instead of inferring one from the other.
 */
export function isHonestFailure<T>(result: Result<T>): boolean {
  return !result.ok
}

// ─── Fail-closed reference handling ───────────────────────────────────────────

/**
 * Whether an unknown reference was refused rather than answered emptily.
 *
 * An adapter asked about an account, contract or window it does not know must
 * FAIL. If it may answer `ok([])`, then every unknown reference silently
 * becomes a flat account, and the fail-closed property of the whole seam is
 * gone.
 */
export function refusedUnknownReference(
  result: Result<readonly PositionSnapshot[]>,
): boolean {
  return !result.ok && !isKnownFlat(result)
}

/**
 * Whether a failure carries a structured reason rather than only prose.
 *
 * v1.2 §8: decisions ride on `reasonCode`; `message` is operator and debugging
 * text and is never decision input. A failure without a reason code would force
 * a consumer to parse the message, which is precisely what the contract forbids.
 */
export function failureCarriesStructuredReason<T>(result: Result<T>): boolean {
  return !result.ok && typeof result.error.reasonCode === 'string'
    && result.error.reasonCode.length > 0
}

// ─── Contract resolution / GATE-08 ────────────────────────────────────────────

/**
 * Whether resolution was by EXPLICIT correspondence rather than inference.
 *
 * Proven behaviourally: a spec the context declares unresolvable must not
 * resolve, even when it shares a prefix with one that does. A front-month rule,
 * a `startsWith` test, a month-code parser or a rollover calendar would all
 * resolve it — and all of them are GATE-08 work, which is OPEN.
 *
 * This function cannot close GATE-08 and does not try to: it only witnesses
 * that no inference happened for the pair the context supplied.
 */
export function resolutionWasExplicit<A, B>(
  resolvable: Result<A>,
  unresolvable: Result<B>,
): boolean {
  return resolvable.ok && !unresolvable.ok
}
