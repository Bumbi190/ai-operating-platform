/**
 * Omnira Trading — deterministic merging of independent replay input streams.
 *
 * THE PROBLEM
 * ───────────
 * A replay timeline is fed by inputs that do not know about each other. Today
 * there are two — application-authored state, and positions observed at a
 * provider — and later there will be more: a real market feed, a strategy
 * engine, a risk engine. They resolve at different times, in different orders,
 * from different places.
 *
 * The resulting timeline must not depend on ANY of that. Specifically it must
 * not depend on promise completion order, on the order the streams were passed
 * in, on object key insertion order, on a wall clock, or on random ids. Two
 * runs with the same logical inputs must serialize byte-identically.
 *
 * THE ANSWER: A TOTAL ORDER THAT NEVER TIES
 * ─────────────────────────────────────────
 * `compareStreamEntries` resolves every pair explicitly, down to a final key
 * that is unique by construction. It returns 0 only when both sides are the
 * same entry of the same stream, which the merge rejects as a duplicate. So
 * `Array.prototype.sort` stability is never load bearing here — the comparator
 * decides the whole order on its own, and a test proves it by shuffling the
 * input and getting the same answer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STREAM PRIORITY IS SERIALIZATION, NOT MARKET TRUTH
 * ─────────────────────────────────────────────────────────────────────────────
 * When two independent streams report the same `occurredAt` and the same
 * `recordedAt`, something has to go first in the array. `STREAM_TIE_BREAK_PRIORITY`
 * decides it, and that is ALL it decides. It does not mean:
 *
 *   - that the application event caused the provider observation,
 *   - that the provider observation caused the application event,
 *   - that either stream has authority over the other.
 *
 * Provider state remains authoritative for what exposure actually exists. That
 * is a claim about reality, and it is untouched by which of two simultaneous
 * records is written to disk first. Reversing these two numbers would change
 * the serialization and change nothing about what is true.
 *
 * Causation is deliberately NOT derived from this order — see the note on
 * `materializeStreams` in `timelines.ts`.
 */

import type { MarketInstrument, Timestamp } from '../market-view'
import type { EventOrigin, ReplayEventPayload, ReplayEventType } from './events'

// ─── Streams ──────────────────────────────────────────────────────────────────

export const REPLAY_STREAM_KINDS = ['APPLICATION', 'PROVIDER_OBSERVATION'] as const
export type ReplayStreamKind = (typeof REPLAY_STREAM_KINDS)[number]

/**
 * Tie-break ranks. Lower sorts earlier. SERIALIZATION ONLY — see the header.
 *
 * Exhaustive over `ReplayStreamKind` so a new kind cannot be added without
 * choosing where it lands, rather than silently inheriting `undefined` and
 * making the comparator non-total.
 */
export const STREAM_TIE_BREAK_PRIORITY: Readonly<Record<ReplayStreamKind, number>> = {
  APPLICATION: 10,
  PROVIDER_OBSERVATION: 20,
}

/**
 * One thing a stream reports, before it is part of any timeline.
 *
 * It carries no `eventId`, no `sequence` and no `causationId`. Those are global
 * properties of an assembled replay, and a stream that minted them would be
 * making claims about events it has never seen. They are added after the merge.
 */
export interface ReplayStreamEntry {
  /** Order within this stream. Unique per stream; meaningless across streams. */
  readonly localSequence: number
  readonly type: ReplayEventType
  readonly instrument: MarketInstrument
  /** Market time — when it happened. */
  readonly occurredAt: Timestamp
  /** When Omnira learned it. May be later than `occurredAt`, and often is. */
  readonly recordedAt: Timestamp
  /**
   * Which lifecycle this belongs to.
   *
   * Core's own field, with Core's own meaning: it threads ONE lifecycle. Two
   * independent streams normally thread different ones, which is what keeps a
   * merged timeline from claiming they are the same story.
   */
  readonly correlationId: string
  /** Which component produced it. Provenance, in Core's field name. */
  readonly sourceComponent: string
  readonly payload: ReplayEventPayload
  readonly summary: string
}

export interface ReplayStream {
  /** Stable identity. Two streams in one merge may never share it. */
  readonly streamId: string
  readonly kind: ReplayStreamKind
  /** What this stream's records are. Stamped onto every event it produces. */
  readonly origin: EventOrigin
  readonly entries: readonly ReplayStreamEntry[]
}

/** An entry together with the stream it came from. What the merge yields. */
export interface MergedStreamEntry {
  readonly streamId: string
  readonly streamKind: ReplayStreamKind
  readonly origin: EventOrigin
  readonly entry: ReplayStreamEntry
}

// ─── The total order ──────────────────────────────────────────────────────────

/**
 * The complete ordering rule, in four explicit steps.
 *
 *   1. `occurredAt`    — market time. What actually happened first.
 *   2. `recordedAt`    — of two things that happened at the same instant, the
 *                        one Omnira learned about first is serialized first.
 *                        This is why the two timestamps must never be collapsed.
 *   3. stream priority — an arbitrary, documented, NON-CAUSAL tie-break.
 *   4. stream id, then source-local sequence — unique by construction.
 *
 * Timestamps compare lexicographically. Every `Timestamp` in this system is a
 * fixed-width `toISOString()` value in UTC, for which lexicographic order and
 * chronological order are the same thing — the same rule `orderReplayEvents`
 * has always used. A test pins the format so this cannot quietly stop holding.
 *
 * Step 4 makes the comparator a STRICT total order: it returns 0 only for the
 * same entry of the same stream. Nothing is left to sort stability.
 */
export function compareStreamEntries(a: MergedStreamEntry, b: MergedStreamEntry): number {
  if (a.entry.occurredAt !== b.entry.occurredAt) {
    return a.entry.occurredAt < b.entry.occurredAt ? -1 : 1
  }
  if (a.entry.recordedAt !== b.entry.recordedAt) {
    return a.entry.recordedAt < b.entry.recordedAt ? -1 : 1
  }
  const priorityA = STREAM_TIE_BREAK_PRIORITY[a.streamKind]
  const priorityB = STREAM_TIE_BREAK_PRIORITY[b.streamKind]
  if (priorityA !== priorityB) return priorityA - priorityB
  if (a.streamId !== b.streamId) return a.streamId < b.streamId ? -1 : 1
  if (a.entry.localSequence !== b.entry.localSequence) {
    return a.entry.localSequence - b.entry.localSequence
  }
  return 0
}

/**
 * Merge independent streams into one deterministic ordering.
 *
 * Pure and total. The result is a function of the streams' CONTENTS alone —
 * `merge([application, provider])` is byte-identical to
 * `merge([provider, application])`, because nothing in the comparator can see
 * which position a stream occupied in the array.
 *
 * Fails closed on ambiguous identity. If two streams shared an id, or one
 * stream repeated a `localSequence`, the comparator could return 0 for two
 * genuinely different entries and their relative order would fall through to
 * whatever the engine's sort happens to do. That is precisely the implicit
 * dependency this module exists to eliminate, so it is refused rather than
 * tolerated.
 */
export function mergeReplayStreams(
  streams: readonly ReplayStream[],
): readonly MergedStreamEntry[] {
  const streamIds = new Set<string>()
  const flat: MergedStreamEntry[] = []

  for (const stream of streams) {
    if (streamIds.has(stream.streamId)) {
      throw new Error(`mergeReplayStreams: duplicate stream id ${stream.streamId}`)
    }
    streamIds.add(stream.streamId)

    const localSequences = new Set<number>()
    for (const entry of stream.entries) {
      if (localSequences.has(entry.localSequence)) {
        throw new Error(
          `mergeReplayStreams: stream ${stream.streamId} repeats localSequence ${entry.localSequence}`,
        )
      }
      localSequences.add(entry.localSequence)
      flat.push({
        streamId: stream.streamId,
        streamKind: stream.kind,
        origin: stream.origin,
        entry,
      })
    }
  }

  return flat.sort(compareStreamEntries)
}

/**
 * Whether a comparator result means "the very same entry".
 *
 * Exported so the strictness of the order is assertable directly, rather than
 * only inferable from a merge that happened to come out right.
 */
export function isSameStreamEntry(a: MergedStreamEntry, b: MergedStreamEntry): boolean {
  return a.streamId === b.streamId && a.entry.localSequence === b.entry.localSequence
}
