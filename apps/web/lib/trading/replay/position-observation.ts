/**
 * Omnira Trading — the provider-observed position seam.
 *
 * WHAT THIS ANSWERS, AND ONLY THIS
 * ────────────────────────────────
 * One question: *what position state was externally observed?* Not what the
 * market looks like, not what Omnira planned, not what it is permitted to do.
 *
 * It is NOT an `ExecutionProviderAdapter`. The adapter is a lower layer that
 * will eventually speak a provider's protocol; this seam sits above it and
 * knows nothing about how the answer was obtained:
 *
 *     provider  →  ExecutionProviderAdapter (Level 1, read only)
 *               →  normalization
 *               →  PositionObservationSource        ← you are here
 *               →  replay assembly
 *
 * Nothing at this level or above may name a provider, a protocol or a session.
 *
 * WHY `PositionObservationSource` AND NOT `ProviderObservationSource`
 * ──────────────────────────────────────────────────────────────────
 * `ObservationSource` is already taken — it is the provenance record stamped on
 * an `ObservedPosition`. A seam called `ProviderObservationSource` would sit one
 * word away from it and be misread constantly. The narrower name is also the
 * truer one: this observes positions. Working orders, fills, margin and account
 * discovery are deliberately absent, and a name that promised them would invite
 * someone to add them here.
 *
 * WHY IT IS NOT A `MarketViewDataSource`
 * ──────────────────────────────────────
 * That seam is forbidden from owning positions, and the prohibition is load
 * bearing. Positions arriving through a *separate* input is what lets both
 * boundaries stay true at once: market data stays market data, and provider
 * reality stays provider reality, and the replay assembler is the only place
 * that has both.
 *
 * AUTHORITY IS ISSUED, NOT DERIVED FROM DATA. Observing exposure tells the
 * system what is true. It never tells it what it may do.
 */

import type { MarketInstrument, Timestamp } from '../market-view'
import type { EventOrigin } from './events'
import type { ObservationSource, ObservedPosition } from './observed-position'

// ─── The query ────────────────────────────────────────────────────────────────

/**
 * What to ask a position-observation source for.
 *
 * DELIBERATELY NOT `MarketViewQuery`. A `timeframe` is meaningless here: a
 * position is not sampled at 5-minute resolution, it simply is or is not open.
 * Reusing the market query would have carried a field no implementation could
 * honour, and an ignored field is worse than an absent one — it reads as
 * supported.
 *
 * Account context is NOT a query parameter either. A source is *bound* to
 * whatever account context it observes when it is constructed, so a caller
 * cannot enumerate or address accounts by asking. There is no account id here,
 * only the opaque display label the source already declares.
 */
export interface PositionObservationQuery {
  readonly instrument: MarketInstrument
}

// ─── What is observed ─────────────────────────────────────────────────────────

export const POSITION_OBSERVATION_KINDS = ['OPENED', 'UPDATED', 'CLOSED'] as const
export type PositionObservationKind = (typeof POSITION_OBSERVATION_KINDS)[number]

/**
 * One thing a provider was seen to report.
 *
 * Deliberately NOT a `ReplayEvent`. An event carries a global sequence, a
 * global event id and a causation chain, and none of those are a provider's to
 * mint — they are properties of the assembled replay, decided after every
 * stream has been merged. A source that minted them would be making claims
 * about events it has never seen.
 *
 * What it does carry is everything the assembler cannot reconstruct: a stable
 * identity, both timestamps, the instrument, what kind of change this was, and
 * the position itself.
 */
export interface PositionObservation {
  /** Stable within this source. Not an order id, not a global event id. */
  readonly observationId: string
  /**
   * Source-local order.
   *
   * The provider's own sequence for this batch, which is the only thing that
   * can order two observations the provider stamped with the same instant. It
   * is a within-source number and says nothing about other streams.
   */
  readonly localSequence: number
  readonly instrument: MarketInstrument
  readonly kind: PositionObservationKind
  /** Market time — when the provider says it happened. */
  readonly occurredAt: Timestamp
  /**
   * When Omnira learned it.
   *
   * Distinct from `occurredAt` on purpose and never collapsed into it: the gap
   * between them is the only thing that reveals delayed reporting, and a model
   * that cannot express the gap cannot detect the lag.
   */
  readonly recordedAt: Timestamp
  readonly position: ObservedPosition
  /** Operator-facing line. A rendering of the payload, never its only record. */
  readonly summary: string
}

// ─── AVAILABLE-AND-EMPTY IS NOT UNAVAILABLE ───────────────────────────────────

/**
 * A provider that was successfully observed.
 *
 * `observations: []` is a REAL, POSITIVE ANSWER: the provider was reached and
 * reported no position. It is not the absence of an answer.
 */
export interface ObservedPositionBatch {
  readonly status: 'OBSERVED'
  readonly sourceId: string
  readonly origin: EventOrigin
  /** Display metadata. Never a handle, never a credential reference. */
  readonly providerLabel: string
  /** Opaque and already redacted, or null when none applies. */
  readonly accountLabel: string | null
  /** When the provider was observed. Market time. */
  readonly observedAt: Timestamp
  readonly observations: readonly PositionObservation[]
}

/**
 * A provider whose state could not be established.
 *
 * THE DISTINCTION THIS TYPE EXISTS TO PROTECT
 * ───────────────────────────────────────────
 *     OBSERVED with zero observations  =  "we looked, and nothing is open"
 *     UNAVAILABLE                      =  "we could not find out"
 *
 * Collapsing the second into the first turns *"I do not know whether exposure
 * exists"* into *"the account is flat"*. That is the single most dangerous
 * silent translation in this entire package, so the two are different shapes
 * and an exhaustive check has to handle both. There is no null in this union
 * for the same reason: null is exactly the value someone would coalesce to an
 * empty array without noticing.
 *
 * `detail` is FOR HUMANS ONLY — an operator line and a journal note. The
 * decision is carried entirely by the discriminant, in keeping with the Level 1
 * adapter contract's rule that provider error strings are never decision input.
 */
export interface UnavailablePositionObservation {
  readonly status: 'UNAVAILABLE'
  readonly sourceId: string
  readonly detail: string
}

export type PositionObservationBatch =
  | ObservedPositionBatch
  | UnavailablePositionObservation

/** True only for a batch that positively reports no open position. */
export function isKnownFlat(batch: PositionObservationBatch): boolean {
  return batch.status === 'OBSERVED' && batch.observations.length === 0
}

/**
 * The observations, or null when the provider could not be observed.
 *
 * Returns `null` rather than `[]` for UNAVAILABLE, so a caller that ignores the
 * distinction gets a type error instead of a flat account.
 */
export function observationsOf(
  batch: PositionObservationBatch,
): readonly PositionObservation[] | null {
  return batch.status === 'OBSERVED' ? batch.observations : null
}

// ─── The seam ─────────────────────────────────────────────────────────────────

/**
 * A read-only source of externally observed position state.
 *
 * `observe` never returns null and never throws for an unreachable provider —
 * unavailability is a value in the result union, because a thrown error is easy
 * to catch and turn into an empty list, and a discriminated union is not.
 */
export interface PositionObservationSource {
  readonly id: string
  readonly label: string
  /**
   * What this source's observations actually are.
   *
   * Declared by the source and never upgraded by a caller or a fallback. A
   * source that cannot honestly claim LIVE must not claim it, and the validator
   * below refuses a batch that disagrees with this declaration.
   */
  readonly origin: EventOrigin
  readonly providerLabel: string
  readonly accountLabel: string | null
  instruments(): readonly MarketInstrument[]
  observe(query: PositionObservationQuery): Promise<PositionObservationBatch>
}

// ─── Fail-closed identity validation ──────────────────────────────────────────

/**
 * Refuse a batch that does not answer the question that was asked.
 *
 * Every check here is a wiring fault, not a market condition, and each one is
 * silent if unchecked: the positions would render perfectly while belonging to
 * another instrument, another account, or another provenance than the header
 * claims. Rewriting the mismatch onto the data would make it invisible and
 * wrong, so the only safe response is to refuse.
 *
 * Throws rather than returning a verdict because there is nothing a caller
 * could reasonably do with a lying source except stop using it.
 */
export function validatePositionObservationBatch(
  source: PositionObservationSource,
  query: PositionObservationQuery,
  batch: PositionObservationBatch,
): void {
  const who = `PositionObservationSource ${source.id}`

  if (batch.sourceId !== source.id) {
    throw new Error(`${who} returned a batch stamped with source id ${batch.sourceId}`)
  }

  // Unavailability carries no observations to check, and refusing it here would
  // turn "could not observe" into an exception the caller might swallow.
  if (batch.status === 'UNAVAILABLE') return

  if (batch.origin !== source.origin) {
    throw new Error(`${who} declares origin ${source.origin} but returned a batch with origin ${batch.origin}`)
  }
  if (batch.providerLabel !== source.providerLabel) {
    throw new Error(`${who} declares provider ${source.providerLabel} but returned ${batch.providerLabel}`)
  }
  if (batch.accountLabel !== source.accountLabel) {
    throw new Error(`${who} declares account ${String(source.accountLabel)} but returned ${String(batch.accountLabel)}`)
  }

  const seen = new Set<string>()
  for (const observation of batch.observations) {
    if (seen.has(observation.observationId)) {
      throw new Error(`${who} returned duplicate observation id ${observation.observationId}`)
    }
    seen.add(observation.observationId)

    if (observation.instrument !== query.instrument) {
      throw new Error(
        `${who} was asked for ${query.instrument} but returned an observation for ${observation.instrument}`,
      )
    }
    if (observation.position.instrument !== observation.instrument) {
      throw new Error(
        `${who} returned an observation for ${observation.instrument} carrying a position `
        + `for ${observation.position.instrument}`,
      )
    }
    if (observation.position.source.origin !== batch.origin) {
      throw new Error(
        `${who} returned a batch with origin ${batch.origin} carrying a position observed `
        + `as ${observation.position.source.origin}`,
      )
    }
    if (observation.position.source.providerLabel !== batch.providerLabel) {
      throw new Error(
        `${who} returned a position attributed to ${observation.position.source.providerLabel}, `
        + `not to ${batch.providerLabel}`,
      )
    }
    if (observation.position.source.accountLabel !== batch.accountLabel) {
      throw new Error(
        `${who} returned a position attributed to a different account label than the batch`,
      )
    }
  }
}

/**
 * Whether an observation can produce a plan, a clearance or an intent.
 *
 * Always false, and there is no counterpart that returns true. This exists so
 * the claim is testable rather than merely written down: a provider telling us
 * that exposure exists is a fact about the world, not permission to add to it.
 */
export function positionObservationGrantsAuthority(observation: PositionObservation): boolean {
  void observation
  return false
}

/**
 * The provenance to stamp on a position this source observed.
 *
 * One place builds it, so a position's `source` cannot drift from the batch's
 * declaration — which is exactly what the validator above cross-checks.
 */
export function observationSourceOf(source: PositionObservationSource): ObservationSource {
  return {
    providerLabel: source.providerLabel,
    accountLabel: source.accountLabel,
    origin: source.origin,
  }
}
