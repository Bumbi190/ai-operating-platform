/**
 * Omnira Trading — the recorded provider transcript.
 *
 * WHAT A TRANSCRIPT IS
 * ────────────────────
 * The complete, authored set of answers a recorded adapter is allowed to give.
 * Every Level-1 method reads its response from here and from nowhere else. There
 * is no computation, no fallback that fabricates a plausible reply, and no
 * method that quietly answers "nothing" when the transcript is silent.
 *
 * WHY THAT MATTERS MORE THAN IT SOUNDS
 * ────────────────────────────────────
 * A harness that invents responses is a harness that can prove things about a
 * provider nobody recorded. The most dangerous version of that is an empty
 * array: `getPositions` returning `ok([])` is a POSITIVE claim — known flat —
 * and a transcript gap must never be able to make it. So a missing recording is
 * a `Result` failure, never an empty success.
 *
 * NUMERIC TRUTH IS AUTHORED AS TEXT
 * ─────────────────────────────────
 * Provider quantities, prices and money are authored as decimal STRINGS and
 * parsed by the canonical `asDecimal`. There is no second parser here and no
 * path from a JS number: `Number('99999999999999999')` is `100000000000000000`,
 * and a fixture that could express that value wrongly is worse than no fixture.
 * Malformed text throws at AUTHORING time, before it can become provider truth.
 *
 * NOT A PROTOCOL MODEL
 * ────────────────────
 * This describes nothing about how any real provider behaves on the wire. There
 * is no transport, no session state machine, no reconnect and no framing. It is
 * a table of recorded answers, and claiming more for it would be a lie about
 * what has been tested.
 */

import { asDecimal, type Decimal } from '../decimal'
import type { AccountId, InstrumentId, PositionId } from '../ids'
import { failure, type ContractId, type Result } from '../provider'
import type { PositionObservationKind } from '../replay'
import type {
  AccountRef,
  ContractRef,
  ContractSnapshot,
  FillHistory,
  OrderSnapshot,
  PositionSnapshot,
  ProviderAccountSnapshot,
  ProviderCapabilities,
  ProviderClock,
  ProviderHealth,
  ProviderIdentity,
  ProviderSession,
  ReadOnlyReconciliation,
} from '../provider'
import type { TradingEnvironment } from '../environment'
import type { MarketFreshness, MarketInstrument, Timestamp } from '../market-view'

// ─── Authoring exact numbers ──────────────────────────────────────────────────

/**
 * Author a provider decimal from its exact text form.
 *
 * The one way a transcript may express a number. Throws on malformed input —
 * a fixture is authored by a person at build time, and the useful moment to
 * refuse '1.2e3' or '01.5' is then, not when a normalizer meets it later.
 */
export function recordedDecimal(text: string): Decimal {
  return asDecimal(text)
}

// ─── Keyed recordings ─────────────────────────────────────────────────────────

/**
 * One recorded answer, addressed by account.
 *
 * A list rather than an object map: entries are matched by explicit scan, so
 * nothing depends on key insertion order or on prototype lookups.
 */
export interface RecordedByAccount<T> {
  readonly accountId: AccountId
  readonly response: Result<T>
}

export interface RecordedByContract<T> {
  readonly contractId: ContractId
  readonly response: Result<T>
}

/**
 * A recorded contract resolution, addressed by the spec's canonical symbol.
 *
 * Keyed on `canonicalSymbol` because that is the one field `ContractSpec`
 * always carries. Matching is exact string equality — no prefix test, no regex,
 * no month-code parsing, and no front-month rule. GATE-08 is open, and a
 * harness is not the place to quietly close it.
 */
export interface RecordedContractResolution {
  readonly canonicalSymbol: string
  readonly response: Result<ContractRef>
}

/**
 * A recorded fill window.
 *
 * The recorded `FillHistory` states which window it answers. A caller asking
 * for a different window gets a failure rather than this recording, because
 * handing back a window nobody asked for would misreport what was covered.
 */
export interface RecordedFillHistory {
  readonly accountId: AccountId
  readonly response: Result<FillHistory>
}

// ─── The transcript ───────────────────────────────────────────────────────────

/**
 * Every answer the recorded adapter may give. Fifteen methods, all authored.
 *
 * Immutable by type. Nothing in the adapter writes to a transcript, and two
 * reads of the same transcript are the same values.
 */
export interface RecordedTranscript {
  readonly connect: Result<ProviderSession>
  readonly identity: Result<ProviderIdentity>
  readonly environment: Result<TradingEnvironment>
  readonly capabilities: Result<ProviderCapabilities>
  readonly health: Result<ProviderHealth>
  readonly providerTime: Result<ProviderClock>
  readonly accounts: Result<readonly AccountRef[]>
  readonly accountSnapshots: readonly RecordedByAccount<ProviderAccountSnapshot>[]
  readonly contractResolutions: readonly RecordedContractResolution[]
  readonly contractSnapshots: readonly RecordedByContract<ContractSnapshot>[]
  readonly positions: readonly RecordedByAccount<readonly PositionSnapshot[]>[]
  readonly workingOrders: readonly RecordedByAccount<readonly OrderSnapshot[]>[]
  readonly recentFills: readonly RecordedFillHistory[]
  readonly reconciliations: readonly RecordedByAccount<ReadOnlyReconciliation>[]
}

// ─── Lookup, and what happens when there is no recording ──────────────────────

/**
 * The failure a transcript gap produces.
 *
 * RECORDED-HARNESS SEMANTICS ONLY — AND THAT LIMIT IS THE DECISION
 * ───────────────────────────────────────────────────────────────
 * A missing keyed recording answers with `REFERENCE_MISMATCH`. That is a rule
 * about THIS HARNESS and nothing else. It is explicitly NOT a prescription for
 * how a future production adapter should behave when a real provider has no
 * answer for a reference: a real provider's silence is a fact about the
 * provider, while this is a fact about an incomplete transcript, and the two
 * have no reason to share a code. Nothing here should be cited as settling that
 * question for a production adapter.
 *
 * No new `ReasonCode` was introduced for it. `REFERENCE_MISMATCH` is the
 * existing Core code for "the reference asked about does not match anything
 * recorded", which is exactly the shape of this problem.
 *
 * A HARNESS FACT, STATED AS ONE. It does not claim the provider was
 * disconnected, that the account does not exist, or that there is no exposure —
 * only that this transcript recorded no answer for the reference that was
 * asked about. The message explains that much for an operator reading a log,
 * and remains human/debug text: `ProviderError.message` is never decision
 * input, and nothing branches on it.
 *
 * The direction is the point: a gap fails closed. It can never become `ok([])`,
 * which would be the harness asserting known-flat on the strength of a missing
 * recording, and it is never a thrown error either — the port's failures are
 * `Result` values.
 */
export function noRecordedResponse<T>(what: string): Result<T> {
  return failure('REFERENCE_MISMATCH', `Inget inspelat svar för ${what}.`)
}

/**
 * The failure an AMBIGUOUS transcript produces.
 *
 * Two authored answers competing for one logical key is malformed input, not a
 * choice to be made. Keeping the first would let array order decide what a
 * provider is deemed to have said; keeping the last is the same defect wearing
 * a different hat; merging them invents a third answer nobody recorded.
 *
 * Same harness-local semantics as `noRecordedResponse`, and the same reason
 * code — `REFERENCE_MISMATCH` covers "the reference does not resolve to exactly
 * one recorded answer" in both directions, none and many. **No new
 * `ReasonCode`.** The message names the count for an operator reading a log and
 * remains human/debug text; nothing branches on it.
 */
export function ambiguousRecordedResponse<T>(what: string, count: number): Result<T> {
  return failure(
    'REFERENCE_MISMATCH',
    `Inspelningen innehåller ${count} svar för ${what}; referensen är tvetydig.`,
  )
}

/**
 * Resolve a logical key to EXACTLY ONE authored entry, or say why not.
 *
 * ORDER-INDEPENDENT BY CONSTRUCTION. It scans the whole array with no early
 * return, so the result is a function of the array's CONTENTS and never of the
 * order they were written in. Reversing the input cannot change the answer —
 * which is the property the tests assert directly rather than inferring from a
 * single ordering that happened to come out right.
 */
export type KeyedLookup<E> =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'ONE'; readonly entry: E }
  | { readonly kind: 'AMBIGUOUS'; readonly count: number }

export function lookupUnique<E>(
  entries: readonly E[],
  matches: (entry: E) => boolean,
): KeyedLookup<E> {
  let found: E | undefined
  let count = 0
  for (const entry of entries) {
    if (!matches(entry)) continue
    count += 1
    if (found === undefined) found = entry
  }
  if (count === 0 || found === undefined) return { kind: 'NONE' }
  if (count > 1) return { kind: 'AMBIGUOUS', count }
  return { kind: 'ONE', entry: found }
}

export function recordedForAccount<T>(
  entries: readonly RecordedByAccount<T>[],
  accountId: AccountId,
  what: string,
): Result<T> {
  const found = lookupUnique(entries, (entry) => entry.accountId === accountId)
  if (found.kind === 'NONE') return noRecordedResponse<T>(`${what} (konto ${accountId})`)
  if (found.kind === 'AMBIGUOUS') {
    return ambiguousRecordedResponse<T>(`${what} (konto ${accountId})`, found.count)
  }
  return found.entry.response
}

export function recordedForContract<T>(
  entries: readonly RecordedByContract<T>[],
  contractId: ContractId,
  what: string,
): Result<T> {
  const found = lookupUnique(entries, (entry) => entry.contractId === contractId)
  if (found.kind === 'NONE') return noRecordedResponse<T>(`${what} (kontrakt ${contractId})`)
  if (found.kind === 'AMBIGUOUS') {
    return ambiguousRecordedResponse<T>(`${what} (kontrakt ${contractId})`, found.count)
  }
  return found.entry.response
}

// ─── Instrument mapping ───────────────────────────────────────────────────────

/**
 * One authored `InstrumentId` → `MarketInstrument` correspondence.
 *
 * EXPLICIT, BECAUSE GATE-08 IS OPEN. Nothing may derive this from a symbol
 * string, a contract id, a provider position reference, an expiration, a month
 * code, a prefix or a regex. If a position's instrument is not in this table,
 * the honest answer is that its attribution is unknown — never a guess, and
 * never a silent drop that would look like known-flat.
 */
export interface InstrumentMappingEntry {
  readonly instrumentId: InstrumentId
  readonly instrument: MarketInstrument
}

// ─── Replay-only metadata ─────────────────────────────────────────────────────

/**
 * The replay facts a provider cannot know, authored per recorded position.
 *
 * WHY EVERY FIELD IS EXPLICIT
 * ───────────────────────────
 * Each of these was, at some point, something a normalizer could have derived —
 * and each derivation would have been an invention:
 *
 *   `kind`         — OPENED/UPDATED/CLOSED is a lifecycle judgement. Deriving it
 *                    by diffing against a previous snapshot is a production
 *                    algorithm nobody has authorized; the audit locked it out of
 *                    this stage.
 *   `freshness`    — a function of an instant and a THRESHOLD. No threshold is
 *                    canon, and inventing 30s or 60s here would bake a policy
 *                    into a harness.
 *   `unattributed` — whether Omnira has a matching plan. That is an application
 *                    question answered above this seam, never a provider fact.
 *   `note`         — operator prose. `null` is a legitimate authored value; what
 *                    is forbidden is a normalizer writing one.
 *   `recordedAt`   — when Omnira learned it. Distinct from when it happened, and
 *                    a wall clock is not allowed to supply either.
 *
 * None of these is added to `PositionSnapshot`. They belong to the recorded
 * replay harness, and putting them on a provider type would dress an Omnira
 * opinion up as an observation.
 */
export interface ObservationReplayMetadata {
  readonly observationId: string
  readonly localSequence: number
  readonly kind: PositionObservationKind
  readonly recordedAt: Timestamp
  readonly freshness: MarketFreshness
  readonly unattributed: boolean
  readonly note: string | null
  readonly summary: string
}

/** Replay metadata addressed by the provider's own position identity. */
export interface ObservationReplayMetadataEntry {
  readonly positionId: PositionId
  readonly metadata: ObservationReplayMetadata
}
