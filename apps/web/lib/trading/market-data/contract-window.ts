/**
 * Omnira Trading — the concrete-contract data window.
 *
 * Canonical source:
 *  - Market Data & Contract Lifecycle Canonical v1.0 §13 (kontraktsskopad dataförfrågan)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §11 (kanoniskt basrutnät — 1m)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §12 (härledda timeframes)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §15 (providersymbolgränsen)
 *  - Market Data & Contract Lifecycle Canonical v1.0 §16 (halvöppet intervall)
 *
 * ROOT RESOLUTION HAPPENS BEFORE THIS TYPE EXISTS
 * ───────────────────────────────────────────────
 * §13 is categorical: every strategy-authoritative provider-facing request
 * receives an ALREADY-RESOLVED contract, never a naked root, and no source may
 * decide `root → contract` for itself. That rule is enforced here by
 * construction rather than by review — the window carries a `ResolvedContract`
 * and has no root field at all, so a request that has not been resolved cannot
 * be spelled.
 *
 * NO PROVIDER SYMBOL, EVER
 * ────────────────────────
 * §15 draws the line: a provider's own contract identifier is provenance, not
 * identity. There is no `providerContractId`, no `ContractId`, no month code,
 * no front-month field and no exchange inference in this file, and the
 * import-discipline suite fails the build if one appears.
 *
 * TWO ROLES, DELIBERATELY NOT ONE TYPE
 * ────────────────────────────────────
 * A `ContractDataWindow` describes ANY contract-scoped interval, at any
 * canonical timeframe — it is what a 5m or 4H segment envelope spans.
 *
 * A `HistoricalContractRequest` is the PROVIDER-FACING one, and it is 1m only.
 * §12 says 5m, 15m and 4H are derived from accepted 1m observations and that no
 * provider-native higher-timeframe bar becomes canonical strategy evidence. If
 * a provider-facing request could ask for 4H, that rule would depend on every
 * future caller remembering it. Here the type simply cannot express it.
 *
 * Blurring the two would be the whole failure: an envelope legitimately holds
 * derived 4H candles; a request must never fetch them.
 */

import { isTimestamp, toEpochMs, type Timestamp } from '../time'
import { parseResolvedContract, type ResolvedContract } from '../contract-identity'
import { isMarketTimeframe, type MarketTimeframe } from '../market-timeframe'

/**
 * The only timeframe a provider may be asked for as canonical strategy input.
 *
 * Derived from the canonical vocabulary rather than restated: `'1m'` is the
 * accepted base observation of §11, and everything else is computed from it.
 */
export const CANONICAL_OBSERVATION_TIMEFRAME = '1m' as const
export type CanonicalObservationTimeframe = typeof CANONICAL_OBSERVATION_TIMEFRAME

/**
 * A contract-scoped interval. Half-open `[from, to)` (§16).
 *
 * `contract` is the whole of the identity. There is deliberately no `root`
 * beside it: two fields describing one thing is two things to keep in step, and
 * the root is already inside the resolved contract.
 */
export interface ContractDataWindow {
  readonly contract: ResolvedContract
  readonly timeframe: MarketTimeframe
  /** Inclusive. */
  readonly from: Timestamp
  /** Exclusive. */
  readonly to: Timestamp
}

/**
 * A provider-facing request for canonical 1m observations of one contract.
 *
 * Structurally 1m — see the module header. Nothing here describes pagination,
 * exhaustion or a subscription; see the SOURCE-RESULT-SHAPE note in the
 * package barrel.
 */
export interface HistoricalContractRequest {
  readonly contract: ResolvedContract
  readonly timeframe: CanonicalObservationTimeframe
  /** Inclusive. */
  readonly from: Timestamp
  /** Exclusive. */
  readonly to: Timestamp
}

/**
 * Why a window could not be built.
 *
 * CALLER-CONTRACT validation, and nothing else. These are NOT canonical
 * `ReasonCode`s: they never reach a journal, never appear in a decision, and
 * carry no market meaning. The canonical reason registry is deliberately not
 * imported here — GATE-08C's REASON-CODE GAP stays open, and inventing a
 * selection code to fill it is C3B's question, not this module's.
 */
export const CONTRACT_WINDOW_PROBLEMS = [
  'UNRESOLVED_CONTRACT',
  'UNSUPPORTED_TIMEFRAME',
  'MALFORMED_INSTANT',
  'EMPTY_INTERVAL',
  'NOT_A_CANONICAL_OBSERVATION_TIMEFRAME',
] as const
export type ContractWindowProblem = (typeof CONTRACT_WINDOW_PROBLEMS)[number]

export type ContractWindowBuild =
  | { readonly ok: true; readonly window: ContractDataWindow }
  | { readonly ok: false; readonly problem: ContractWindowProblem; readonly detail: string }

export type HistoricalContractRequestBuild =
  | { readonly ok: true; readonly request: HistoricalContractRequest }
  | { readonly ok: false; readonly problem: ContractWindowProblem; readonly detail: string }

const refuse = (problem: ContractWindowProblem, detail: string) =>
  Object.freeze({ ok: false as const, problem, detail })

/**
 * The interval checks both builders share.
 *
 * Instants are compared through `toEpochMs`, never as text. `Timestamp` permits
 * an optional millisecond field, so `…T00:00:00Z` and `…T00:00:00.500Z` order
 * WRONG as strings — '.' sorts before 'Z' — and a text comparison would accept
 * a backwards window as a forwards one.
 */
function checkInterval(
  from: unknown,
  to: unknown,
): { readonly ok: true } | { readonly ok: false; readonly problem: ContractWindowProblem; readonly detail: string } {
  if (!isTimestamp(from) || !isTimestamp(to)) {
    return { ok: false, problem: 'MALFORMED_INSTANT', detail: 'from/to must be canonical Timestamps' }
  }
  if (toEpochMs(from) >= toEpochMs(to)) {
    return { ok: false, problem: 'EMPTY_INTERVAL', detail: 'from must be strictly before to' }
  }
  return { ok: true }
}

/** Build a contract-scoped window at any canonical timeframe. Fails closed. */
export function buildContractDataWindow(input: {
  readonly contract: unknown
  readonly timeframe: unknown
  readonly from: unknown
  readonly to: unknown
}): ContractWindowBuild {
  const contract = parseResolvedContract(input.contract)
  if (contract === null) {
    return refuse('UNRESOLVED_CONTRACT', 'contract must be a resolved root plus cycle, never a bare root')
  }
  if (!isMarketTimeframe(input.timeframe)) {
    return refuse('UNSUPPORTED_TIMEFRAME', 'timeframe is not a canonical MarketTimeframe')
  }
  const interval = checkInterval(input.from, input.to)
  if (!interval.ok) return refuse(interval.problem, interval.detail)

  return Object.freeze({
    ok: true as const,
    window: Object.freeze({
      contract,
      timeframe: input.timeframe,
      from: input.from as Timestamp,
      to: input.to as Timestamp,
    }),
  })
}

/**
 * Build a provider-facing request for canonical 1m observations.
 *
 * A 5m, 15m or 4H timeframe is refused rather than accommodated. §12 does not
 * merely prefer derivation from 1m; it forbids a provider-native higher
 * timeframe from becoming canonical strategy evidence at all, so the request
 * that would fetch one has no valid form.
 */
export function buildHistoricalContractRequest(input: {
  readonly contract: unknown
  readonly timeframe: unknown
  readonly from: unknown
  readonly to: unknown
}): HistoricalContractRequestBuild {
  const contract = parseResolvedContract(input.contract)
  if (contract === null) {
    return refuse('UNRESOLVED_CONTRACT', 'contract must be a resolved root plus cycle, never a bare root')
  }
  if (input.timeframe !== CANONICAL_OBSERVATION_TIMEFRAME) {
    return refuse(
      'NOT_A_CANONICAL_OBSERVATION_TIMEFRAME',
      'a provider-facing strategy-authoritative request accepts the canonical base observation only',
    )
  }
  const interval = checkInterval(input.from, input.to)
  if (!interval.ok) return refuse(interval.problem, interval.detail)

  return Object.freeze({
    ok: true as const,
    request: Object.freeze({
      contract,
      timeframe: CANONICAL_OBSERVATION_TIMEFRAME,
      from: input.from as Timestamp,
      to: input.to as Timestamp,
    }),
  })
}
