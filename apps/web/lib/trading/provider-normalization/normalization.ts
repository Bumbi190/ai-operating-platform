/**
 * Omnira Trading — the provider → replay normalization.
 *
 * WHY THIS PACKAGE IS A SIBLING, NOT A CHILD
 * ──────────────────────────────────────────
 * `provider/` and `replay/` own separate vocabularies and neither may import the
 * other. That separation is load bearing: `Available<T>` is what an adapter can
 * say about a field, `ObservedValue<T>` is what replay shows an operator, and
 * aliasing them would make one package's decisions silently binding on the
 * other's. Translation still has to live somewhere, so it lives HERE — the one
 * module allowed to see both sides, precisely so that neither side has to.
 *
 * PURE, AND PURE IN A SPECIFIC SENSE
 * ──────────────────────────────────
 * Every answer is a function of the arguments alone. No clock, no network, no
 * module-global cursor, no accumulated state between calls, and no dependence on
 * the order in which anything was processed. The same snapshots and the same
 * context give a deeply equal result, always.
 *
 * WHAT IT REFUSES TO INVENT
 * ─────────────────────────
 * The interesting part of this file is the list of things it does NOT compute:
 *
 *   lifecycle kind  — no previous-frame diff. "absent → OPENED, changed →
 *                     UPDATED, missing → CLOSED" is a production algorithm that
 *                     no canon has authorized, and a harness inventing one would
 *                     make it look settled.
 *   freshness       — no threshold, no wall clock, no age arithmetic.
 *   unattributed    — not a provider fact. Plan correspondence is answered above
 *                     this seam, and reaching for an application plan from
 *                     inside provider normalization would invert the layering.
 *   instrument      — no symbol inference of any kind. Explicit table only.
 *
 * All four arrive as authored replay metadata. Where metadata is missing, the
 * batch fails closed rather than acquiring a default.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA. A normalized observation is a
 * record. It cannot mint `RiskClearance`, `PropClearance`, `ApprovalGrant` or
 * `ExecutionIntent`, and this module never imports `lib/trading/internal/`.
 */

import type { Decimal } from '../decimal'
import type { AccountId } from '../ids'
import type { MarketInstrument, PriceText } from '../market-view'
import type {
  Available,
  PositionSide,
  PositionSnapshot,
  PositionState,
} from '../provider'
import {
  present,
  unavailable,
  unknownValue,
  type ObservationSource,
  type ObservedPosition,
  type ObservedPositionDirection,
  type ObservedPositionState,
  type ObservedValue,
  type PositionObservation,
  type QuantityText,
} from '../replay'
import { lookupUnique, type KeyedLookup } from './transcript'
import type {
  InstrumentMappingEntry,
  ObservationReplayMetadata,
  ObservationReplayMetadataEntry,
} from './transcript'

// ─── Available<T> → ObservedValue<U> ──────────────────────────────────────────

/**
 * Carry a provider reading into replay vocabulary, member for member.
 *
 * THE THREE STATES STAY THREE. `UNKNOWN` does not become `UNAVAILABLE`,
 * `UNAVAILABLE` does not become `UNKNOWN`, and neither becomes `null`, `[]`,
 * `0`, `false` or `''`. "The provider demonstrably has no value" and "we were
 * not told" are different facts, and only one of them is worth retrying.
 *
 * `observedOrNull` is deliberately not used anywhere in this package: it maps
 * both non-present states onto one value, which is exactly the collapse this
 * function exists to prevent.
 *
 * The mapper runs only in the PRESENT branch, so a value transform can never be
 * asked to invent something out of an absent reading.
 */
export function mapAvailable<T, U>(
  value: Available<T>,
  map: (value: T) => U,
): ObservedValue<U> {
  switch (value.state) {
    case 'PRESENT':
      return present(map(value.value))
    case 'UNAVAILABLE':
      return unavailable<U>()
    case 'UNKNOWN':
      return unknownValue<U>()
    default: {
      // Exhaustiveness is checked by the compiler, not by a runtime default that
      // would quietly absorb a fourth state someone added later.
      const exhaustive: never = value
      return exhaustive
    }
  }
}

// ─── Decimal → exact text ─────────────────────────────────────────────────────

/*
 * `Decimal.text` IS the canonical normalized form — it is what `parseDecimal`
 * produced and what `parseQuantityText` / `parsePriceText` would hand back for
 * the same input. Re-parsing it here would be a round trip through the same
 * parser for no gain, and would add an unreachable failure branch to a path that
 * cannot fail. `normalization.test.ts` proves the equivalence directly, on the
 * exact values that break a JS number, rather than asserting it in prose.
 *
 * What must never appear on this path: Number(), parseFloat(), parseInt(), unary
 * plus, or any arithmetic at all.
 */

/** A provider quantity, exactly. Not a price — the brands are separate on purpose. */
function toQuantityText(value: Decimal): QuantityText {
  return value.text as QuantityText
}

/** A provider price, distance or money amount, exactly. */
function toPriceText(value: Decimal): PriceText {
  return value.text as PriceText
}

// ─── Enumerations, mapped exhaustively ────────────────────────────────────────

/**
 * Direction, member for member.
 *
 * `UNKNOWN` stays `UNKNOWN` and never becomes `NEUTRAL`. Replay's
 * `DisplayDirection` does have a NEUTRAL, and it means something else entirely —
 * a strategy with no bias. A position whose side the provider could not report
 * is not unbiased; it is unknown, and saying NEUTRAL would assert a fact nobody
 * established.
 *
 * Typed as a total `Record`, so adding a side to either vocabulary fails to
 * compile instead of falling through to `undefined`.
 */
const DIRECTION_OF_SIDE: Readonly<Record<PositionSide, ObservedPositionDirection>> = {
  LONG: 'LONG',
  SHORT: 'SHORT',
  UNKNOWN: 'UNKNOWN',
}

/** Position state, member for member, and total for the same reason. */
const STATE_OF_STATE: Readonly<Record<PositionState, ObservedPositionState>> = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  UNKNOWN: 'UNKNOWN',
}

// ─── Refusals ─────────────────────────────────────────────────────────────────

/**
 * Why a batch could not be normalized honestly.
 *
 * Structured values, not prose. Every consumer branches on these; nothing
 * branches on a message string, in keeping with the adapter contract's rule that
 * provider error text is never decision input.
 */
export const NORMALIZATION_REFUSALS = [
  'ACCOUNT_MISMATCH',
  'INSTRUMENT_UNRESOLVED',
  'REPLAY_METADATA_MISSING',
  'DUPLICATE_POSITION_ID',
  /*
   * Two authored answers competing for one logical key.
   *
   * Package-local vocabulary, deliberately NOT a Core `ReasonCode`: these are
   * facts about malformed authored harness configuration, not about a provider,
   * and Core's reason codes describe the trading domain rather than the shape of
   * a fixture table.
   *
   * Separate from the *_MISSING and *_UNRESOLVED refusals because they are
   * different faults with different fixes — nothing recorded versus too much
   * recorded — and collapsing them would make the second look like the first.
   */
  'AMBIGUOUS_INSTRUMENT_MAPPING',
  'AMBIGUOUS_REPLAY_METADATA',
] as const
export type NormalizationRefusal = (typeof NORMALIZATION_REFUSALS)[number]

export type PositionBatchNormalization =
  | { readonly outcome: 'NORMALIZED'; readonly observations: readonly PositionObservation[] }
  | {
      readonly outcome: 'REFUSED'
      readonly refusal: NormalizationRefusal
      /** Operator and journal text. Never decision input. */
      readonly detail: string
    }

// ─── Context ──────────────────────────────────────────────────────────────────

export interface PositionNormalizationContext {
  /** The one account this normalization is bound to. */
  readonly accountId: AccountId
  /** The provenance to stamp on every position, built by the source. */
  readonly source: ObservationSource
  /** The instrument that was asked about. */
  readonly instrument: MarketInstrument
  readonly instrumentMappings: readonly InstrumentMappingEntry[]
  readonly replayMetadata: readonly ObservationReplayMetadataEntry[]
}

function refuse(
  refusal: NormalizationRefusal,
  detail: string,
): PositionBatchNormalization {
  return { outcome: 'REFUSED', refusal, detail }
}

/**
 * The keys an authored table repeats.
 *
 * Scans the whole array and returns every duplicated key, so the answer depends
 * on the table's CONTENTS and never on the order it was written in. Two entries
 * sharing a key are malformed input whether they agree or not: nothing in this
 * repository states that a duplicated mapping key is permitted, and an
 * identical duplicate is still a table that has to be de-duplicated by someone
 * before it can be read — which is a decision, not a lookup.
 */
function duplicateKeys<E>(entries: readonly E[], keyOf: (entry: E) => string): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const entry of entries) {
    const key = keyOf(entry)
    if (seen.has(key)) repeated.add(key)
    seen.add(key)
  }
  return [...repeated].sort()
}

/**
 * Explicit table lookup. No inference of any kind lives in this function.
 *
 * `lookupUnique` scans the whole table with no early return, so a duplicated
 * key can never resolve to "whichever was authored first".
 */
function mappedInstrument(
  mappings: readonly InstrumentMappingEntry[],
  instrumentId: string,
): KeyedLookup<InstrumentMappingEntry> {
  return lookupUnique(mappings, (entry) => entry.instrumentId === instrumentId)
}

function metadataFor(
  entries: readonly ObservationReplayMetadataEntry[],
  positionId: string,
): KeyedLookup<ObservationReplayMetadataEntry> {
  return lookupUnique(entries, (entry) => entry.positionId === positionId)
}

// ─── The normalization ────────────────────────────────────────────────────────

/**
 * Turn recorded provider positions into replay observations, or refuse.
 *
 * ORDER OF CHECKS, AND WHY IT IS THIS ORDER
 * ─────────────────────────────────────────
 * 1. Duplicate `positionId`, across the WHOLE batch. Two rows claiming one
 *    identity is malformed input; keeping the first, keeping the last or merging
 *    them all invent a resolution the provider never stated.
 * 2. Account binding, across the WHOLE batch — including rows for instruments
 *    this query will not return. A snapshot for another account means the batch
 *    is not what it claims to be, and that is true regardless of which rows the
 *    query would have kept. The snapshot is never rewritten to match.
 * 3. Instrument attribution, per row. Unresolvable → refuse; resolved to a
 *    DIFFERENT known instrument → safely excluded.
 * 4. Replay metadata, per included row.
 *
 * The exclusion in step 3 is the only case where a row disappears, and it is
 * safe precisely because the instrument was positively identified as some other
 * known instrument. A row whose attribution is UNKNOWN, UNAVAILABLE or unmapped
 * is NOT excluded — dropping it would shrink the batch toward emptiness, and an
 * empty batch is the positive claim "known flat".
 */
export function normalizePositionSnapshots(
  snapshots: readonly PositionSnapshot[],
  context: PositionNormalizationContext,
): PositionBatchNormalization {
  /*
   * The authored tables are checked BEFORE anything is read out of them.
   *
   * A duplicated key makes the table unreadable, not merely awkward — and it is
   * refused here even when the duplicate is for an instrument or a position
   * this query would never have touched. A malformed table is a wiring fault,
   * and catching it only when it happens to be consulted would mean the same
   * fixture passes or fails depending on which question was asked of it.
   */
  const duplicateMappings = duplicateKeys(context.instrumentMappings, (e) => e.instrumentId)
  if (duplicateMappings.length > 0) {
    return refuse(
      'AMBIGUOUS_INSTRUMENT_MAPPING',
      `Instrumenttabellen har flera poster för ${duplicateMappings.join(', ')}.`,
    )
  }

  const duplicateMetadata = duplicateKeys(context.replayMetadata, (e) => e.positionId)
  if (duplicateMetadata.length > 0) {
    return refuse(
      'AMBIGUOUS_REPLAY_METADATA',
      `Replay-metadata har flera poster för ${duplicateMetadata.join(', ')}.`,
    )
  }

  const seenPositionIds = new Set<string>()
  for (const snapshot of snapshots) {
    if (seenPositionIds.has(snapshot.positionId)) {
      return refuse(
        'DUPLICATE_POSITION_ID',
        `Providern rapporterade positions-id ${snapshot.positionId} mer än en gång.`,
      )
    }
    seenPositionIds.add(snapshot.positionId)

    if (snapshot.accountId !== context.accountId) {
      return refuse(
        'ACCOUNT_MISMATCH',
        `Position ${snapshot.positionId} tillhör ett annat konto än det bundna.`,
      )
    }
  }

  const observations: PositionObservation[] = []

  for (const snapshot of snapshots) {
    if (snapshot.instrumentId.state !== 'PRESENT') {
      return refuse(
        'INSTRUMENT_UNRESOLVED',
        `Position ${snapshot.positionId} saknar instrumentattribution `
        + `(${snapshot.instrumentId.state}).`,
      )
    }

    const mapping = mappedInstrument(context.instrumentMappings, snapshot.instrumentId.value)
    /*
     * Ambiguity is judged BEFORE the instrument is compared to the query.
     *
     * A position whose id maps to two instruments cannot be excluded as "some
     * other instrument" — it might be the one being asked about. Excluding it
     * would shrink the batch toward emptiness, and an empty batch is the
     * positive claim that the account is flat.
     */
    if (mapping.kind === 'AMBIGUOUS') {
      return refuse(
        'AMBIGUOUS_INSTRUMENT_MAPPING',
        `Position ${snapshot.positionId} har ${mapping.count} konkurrerande instrumentuppslag.`,
      )
    }
    if (mapping.kind === 'NONE') {
      return refuse(
        'INSTRUMENT_UNRESOLVED',
        `Position ${snapshot.positionId} har inget explicit instrumentuppslag.`,
      )
    }
    const instrument = mapping.entry.instrument

    // Positively identified as a different known instrument: not our question.
    if (instrument !== context.instrument) continue

    const metadata = metadataFor(context.replayMetadata, snapshot.positionId)
    if (metadata.kind === 'AMBIGUOUS') {
      return refuse(
        'AMBIGUOUS_REPLAY_METADATA',
        `Position ${snapshot.positionId} har ${metadata.count} konkurrerande metadataposter.`,
      )
    }
    if (metadata.kind === 'NONE') {
      return refuse(
        'REPLAY_METADATA_MISSING',
        `Position ${snapshot.positionId} saknar inspelad replay-metadata.`,
      )
    }

    observations.push(observationOf(snapshot, instrument, metadata.entry.metadata, context.source))
  }

  return { outcome: 'NORMALIZED', observations }
}

/**
 * One provider snapshot, as a replay observation.
 *
 * `occurredAt` and `lastObservedAt` both come from `PositionSnapshot.observedAt`
 * — the provider's own observation instant. `recordedAt` is authored metadata,
 * because when Omnira LEARNED something is not a fact the provider holds. The
 * two are never collapsed: the gap between them is the only thing that reveals
 * delayed reporting.
 *
 * `PositionSnapshot.providerTime` is INTENTIONALLY NOT PROPAGATED. `ProviderTimestamp`
 * is provider-owned provenance, and replay's `ObservedPosition` has no field
 * that carries it. Widening it into a `Timestamp` would erase the distinction
 * the brand exists to hold, and using it as `recordedAt` or as a freshness proof
 * would be worse — it is neither. Rather than invent a destination, the value
 * stops here, and a test pins that this omission is deliberate.
 */
function observationOf(
  snapshot: PositionSnapshot,
  instrument: MarketInstrument,
  metadata: ObservationReplayMetadata,
  source: ObservationSource,
): PositionObservation {
  const position: ObservedPosition = {
    // A branded `PositionId` widens losslessly into replay's string identity.
    positionId: snapshot.positionId,
    source,
    instrument,
    state: STATE_OF_STATE[snapshot.state],
    direction: DIRECTION_OF_SIDE[snapshot.side],
    quantity: mapAvailable(snapshot.quantity, toQuantityText),
    averageEntry: mapAvailable(snapshot.averageEntry, toPriceText),
    lastPrice: mapAvailable(snapshot.lastPrice, toPriceText),
    unrealizedPnl: mapAvailable(snapshot.unrealizedPnl, toPriceText),
    stopLoss: mapAvailable(snapshot.stopLoss, toPriceText),
    takeProfit: mapAvailable(snapshot.takeProfit, toPriceText),
    openedAt: mapAvailable(snapshot.openedAt, (instant) => instant),
    lastObservedAt: snapshot.observedAt,
    freshness: metadata.freshness,
    unattributed: metadata.unattributed,
    note: metadata.note,
  }

  return {
    observationId: metadata.observationId,
    localSequence: metadata.localSequence,
    instrument,
    kind: metadata.kind,
    occurredAt: snapshot.observedAt,
    recordedAt: metadata.recordedAt,
    position,
    summary: metadata.summary,
  }
}
