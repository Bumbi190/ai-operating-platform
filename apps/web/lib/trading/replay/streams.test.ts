/**
 * The deterministic multi-stream assembler.
 *
 * The claims here are about ORDER, and about what the order is NOT allowed to
 * depend on. A merge that is right by accident — because the engine's sort
 * happened to be stable, or because the caller happened to pass the streams in
 * a convenient order — is the failure mode these tests exist to catch, so
 * several of them deliberately supply the same logical input in a different
 * shape and demand the same bytes back.
 */

import { describe, expect, it } from 'vitest'
import {
  REPLAY_STREAM_KINDS,
  STREAM_TIE_BREAK_PRIORITY,
  compareStreamEntries,
  isSameStreamEntry,
  mergeReplayStreams,
  type MergedStreamEntry,
  type ReplayStream,
  type ReplayStreamEntry,
} from './streams'
import { buildReplayTimeline } from './timelines'
import type { MarketInstrument, Timestamp } from '../market-view'

const T = (iso: string) => iso as unknown as Timestamp

function entry(
  localSequence: number,
  occurredAt: string,
  recordedAt: string = occurredAt,
  correlationId = 'c1',
): ReplayStreamEntry {
  return {
    localSequence,
    type: 'CANDLE_ADVANCED',
    instrument: 'NQ' as MarketInstrument,
    occurredAt: T(occurredAt),
    recordedAt: T(recordedAt),
    correlationId,
    sourceComponent: 'test',
    payload: { candleIndex: localSequence },
    summary: `entry ${localSequence}`,
  }
}

function stream(
  streamId: string,
  kind: ReplayStream['kind'],
  entries: readonly ReplayStreamEntry[],
): ReplayStream {
  return { streamId, kind, origin: 'FIXTURE', entries }
}

const ids = (merged: readonly MergedStreamEntry[]) =>
  merged.map((item) => `${item.streamId}#${item.entry.localSequence}`)

// ─── The ordering rule ────────────────────────────────────────────────────────

describe('the ordering is total and every tie resolves explicitly', () => {
  it('orders by market time first', () => {
    const app = stream('a', 'APPLICATION', [entry(0, '2026-01-01T00:03:00.000Z')])
    const prov = stream('p', 'PROVIDER_OBSERVATION', [entry(0, '2026-01-01T00:01:00.000Z')])
    expect(ids(mergeReplayStreams([app, prov]))).toEqual(['p#0', 'a#0'])
  })

  it('breaks an occurredAt tie on recordedAt, so a late report sorts later', () => {
    const early = stream('a', 'APPLICATION', [
      entry(0, '2026-01-01T00:01:00.000Z', '2026-01-01T00:09:00.000Z'),
    ])
    // Same instant, learned about sooner — so it serializes first even though
    // its stream would otherwise lose the priority tie-break.
    const late = stream('p', 'PROVIDER_OBSERVATION', [
      entry(0, '2026-01-01T00:01:00.000Z', '2026-01-01T00:02:00.000Z'),
    ])
    expect(ids(mergeReplayStreams([early, late]))).toEqual(['p#0', 'a#0'])
  })

  it('falls through to stream priority only when both timestamps tie', () => {
    const at = '2026-01-01T00:01:00.000Z'
    const app = stream('a', 'APPLICATION', [entry(0, at)])
    const prov = stream('p', 'PROVIDER_OBSERVATION', [entry(0, at)])
    expect(ids(mergeReplayStreams([app, prov]))).toEqual(['a#0', 'p#0'])
    expect(STREAM_TIE_BREAK_PRIORITY.APPLICATION)
      .toBeLessThan(STREAM_TIE_BREAK_PRIORITY.PROVIDER_OBSERVATION)
  })

  it('breaks a same-kind, same-instant tie on stream id, then local sequence', () => {
    const at = '2026-01-01T00:01:00.000Z'
    const zebra = stream('zebra', 'APPLICATION', [entry(1, at), entry(0, at)])
    const alpha = stream('alpha', 'APPLICATION', [entry(0, at)])
    expect(ids(mergeReplayStreams([zebra, alpha])))
      .toEqual(['alpha#0', 'zebra#0', 'zebra#1'])
  })

  it('ranks every stream kind, so no kind can sort as undefined', () => {
    for (const kind of REPLAY_STREAM_KINDS) {
      expect(typeof STREAM_TIE_BREAK_PRIORITY[kind], kind).toBe('number')
    }
    expect(Object.keys(STREAM_TIE_BREAK_PRIORITY).sort()).toEqual([...REPLAY_STREAM_KINDS].sort())
  })

  it('returns 0 only for the very same entry — nothing is left to sort stability', () => {
    const at = '2026-01-01T00:01:00.000Z'
    const all: MergedStreamEntry[] = [
      { streamId: 'a', streamKind: 'APPLICATION', origin: 'FIXTURE', entry: entry(0, at) },
      { streamId: 'a', streamKind: 'APPLICATION', origin: 'FIXTURE', entry: entry(1, at) },
      { streamId: 'b', streamKind: 'APPLICATION', origin: 'FIXTURE', entry: entry(0, at) },
      { streamId: 'p', streamKind: 'PROVIDER_OBSERVATION', origin: 'FIXTURE', entry: entry(0, at) },
    ]
    for (const a of all) {
      for (const b of all) {
        const tied = compareStreamEntries(a, b) === 0
        expect(tied, `${a.streamId}#${a.entry.localSequence} vs ${b.streamId}#${b.entry.localSequence}`)
          .toBe(isSameStreamEntry(a, b))
      }
    }
  })

  it('is antisymmetric and transitive over a tricky set', () => {
    const at = '2026-01-01T00:01:00.000Z'
    const items: MergedStreamEntry[] = [
      { streamId: 'a', streamKind: 'APPLICATION', origin: 'FIXTURE', entry: entry(0, at, '2026-01-01T00:05:00.000Z') },
      { streamId: 'a', streamKind: 'APPLICATION', origin: 'FIXTURE', entry: entry(1, at) },
      { streamId: 'p', streamKind: 'PROVIDER_OBSERVATION', origin: 'FIXTURE', entry: entry(0, at) },
      { streamId: 'p', streamKind: 'PROVIDER_OBSERVATION', origin: 'FIXTURE', entry: entry(1, '2026-01-01T00:00:00.000Z') },
    ]
    // Normalised by hand: `Math.sign(0)` negates to -0, which `toBe` rejects.
    const sign = (n: number) => (n < 0 ? -1 : n > 0 ? 1 : 0)
    for (const a of items) {
      for (const b of items) {
        expect(sign(compareStreamEntries(a, b))).toBe(-sign(compareStreamEntries(b, a)) || 0)
      }
    }
    const sorted = [...items].sort(compareStreamEntries)
    for (let i = 1; i < sorted.length; i += 1) {
      expect(compareStreamEntries(sorted[i - 1], sorted[i])).toBeLessThan(0)
    }
  })
})

// ─── Independence from how the input arrived ──────────────────────────────────

describe('the result depends on stream contents and nothing else', () => {
  const at = (m: number) => `2026-01-01T00:0${m}:00.000Z`
  const app = stream('application:x', 'APPLICATION', [
    entry(0, at(1)), entry(1, at(3)), entry(2, at(5)),
  ])
  const prov = stream('observation:x', 'PROVIDER_OBSERVATION', [
    entry(0, at(2)), entry(1, at(3)),
  ])

  it('is byte-identical when the stream array is reversed', () => {
    const forward = mergeReplayStreams([app, prov])
    const reversed = mergeReplayStreams([prov, app])
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward))
  })

  it('is byte-identical when entries arrive reversed within a stream', () => {
    const shuffledApp = stream('application:x', 'APPLICATION', [...app.entries].reverse())
    const shuffledProv = stream('observation:x', 'PROVIDER_OBSERVATION', [...prov.entries].reverse())
    expect(JSON.stringify(mergeReplayStreams([shuffledProv, shuffledApp])))
      .toBe(JSON.stringify(mergeReplayStreams([app, prov])))
  })

  it('is byte-identical under every permutation of a deterministic shuffle', () => {
    const expected = JSON.stringify(mergeReplayStreams([app, prov]))
    // A fixed set of rotations of the combined entry order. No randomness: the
    // point is reproducibility, and a random shuffle would make a failure
    // impossible to re-run.
    for (let rotate = 0; rotate < 3; rotate += 1) {
      const rotated = (s: ReplayStream): ReplayStream => ({
        ...s,
        entries: [...s.entries.slice(rotate), ...s.entries.slice(0, rotate)],
      })
      expect(JSON.stringify(mergeReplayStreams([rotated(prov), rotated(app)])), `rotate ${rotate}`)
        .toBe(expected)
    }
  })

  it('is byte-identical on a repeated merge of the same inputs', () => {
    expect(JSON.stringify(mergeReplayStreams([app, prov])))
      .toBe(JSON.stringify(mergeReplayStreams([app, prov])))
  })

  it('does not mutate the streams it was given', () => {
    const before = JSON.stringify([app, prov])
    mergeReplayStreams([app, prov])
    expect(JSON.stringify([app, prov])).toBe(before)
  })
})

// ─── Ambiguous identity is refused, not tolerated ─────────────────────────────

describe('identity ambiguity fails closed', () => {
  it('refuses two streams that share an id', () => {
    const a = stream('same', 'APPLICATION', [entry(0, '2026-01-01T00:01:00.000Z')])
    const b = stream('same', 'PROVIDER_OBSERVATION', [entry(1, '2026-01-01T00:02:00.000Z')])
    expect(() => mergeReplayStreams([a, b])).toThrow(/duplicate stream id same/)
  })

  it('refuses a stream that repeats a local sequence', () => {
    const at = '2026-01-01T00:01:00.000Z'
    const a = stream('a', 'APPLICATION', [entry(0, at), entry(0, at)])
    expect(() => mergeReplayStreams([a])).toThrow(/repeats localSequence 0/)
  })

  it('accepts the same local sequence in two different streams', () => {
    const a = stream('a', 'APPLICATION', [entry(0, '2026-01-01T00:01:00.000Z')])
    const b = stream('b', 'PROVIDER_OBSERVATION', [entry(0, '2026-01-01T00:02:00.000Z')])
    expect(ids(mergeReplayStreams([a, b]))).toEqual(['a#0', 'b#0'])
  })
})

// ─── The lexicographic timestamp assumption ───────────────────────────────────

describe('lexicographic timestamp comparison is safe for this system', () => {
  it('pins the fixed-width UTC format every fixture timestamp uses', () => {
    const timeline = buildReplayTimeline('unknown-stale', 'NQ', '5m')
    const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    for (const event of timeline.events) {
      expect(event.occurredAt, event.eventId).toMatch(iso)
      expect(event.recordedAt, event.eventId).toMatch(iso)
    }
  })

  it('agrees with chronological order on those values', () => {
    const timeline = buildReplayTimeline('neutral-no-setup', 'NQ', '5m')
    for (let i = 1; i < timeline.events.length; i += 1) {
      const previous = timeline.events[i - 1].occurredAt
      const current = timeline.events[i].occurredAt
      const lexicographic = previous <= current
      const chronological = Date.parse(previous) <= Date.parse(current)
      expect(lexicographic).toBe(chronological)
    }
  })
})

// ─── Empty inputs ─────────────────────────────────────────────────────────────

describe('empty streams', () => {
  it('merges an empty stream into nothing rather than failing', () => {
    const app = stream('a', 'APPLICATION', [entry(0, '2026-01-01T00:01:00.000Z')])
    const none = stream('p', 'PROVIDER_OBSERVATION', [])
    expect(ids(mergeReplayStreams([app, none]))).toEqual(['a#0'])
    expect(mergeReplayStreams([])).toEqual([])
  })
})
