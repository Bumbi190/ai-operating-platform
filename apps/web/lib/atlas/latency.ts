/**
 * lib/atlas/latency.ts — phase-level timing for one Atlas response.
 *
 * The voice path already measured exactly one number: speech-end to first
 * audible word. That is the number the operator feels, but it says nothing
 * about WHERE the time went, so it could not drive an optimisation decision.
 *
 * This module is the bookkeeping for a request-relative timeline. It is
 * deliberately pure — no React, no clock of its own, no I/O — so the merge,
 * write-once and isolation rules below can be tested without a DOM, a network
 * or a speaker.
 *
 * MEASUREMENT ONLY. Nothing here changes what Atlas says, when it speaks, or
 * how playback behaves.
 */

/** Where T0 came from. A typed request has no speech to end. */
export type LatencyOrigin = 'voice' | 'typed'

/** The three durations the chat route already computes server-side. */
export interface AtlasServerTiming {
  contextMs?: number
  firstTokenMs?: number
  serverTotalMs?: number
}

/**
 * One request's marks, all `performance.now()` values on the client clock.
 *
 * `generation` is the isolation key. A cancelled response can still have a TTS
 * fetch or a playback callback in flight, and without this those late writes
 * would land in the NEXT request's timeline and quietly invent a latency that
 * nobody experienced.
 */
export interface AtlasLatencyMarks {
  readonly generation: number
  readonly origin: LatencyOrigin
  /** Operator submit: speech-end for voice, send for typed. */
  readonly t0: number
  sent?: number
  firstByte?: number
  firstSentence?: number
  ttsStart?: number
  ttsBlobReady?: number
  /** The blob is handed to the playback module. NOT `audio.play()` — see below. */
  playbackHandoff?: number
  /** The browser's `playing` event. The only mark that means audible. */
  firstAudio?: number
}

export type AtlasLatencyMark = keyof Omit<AtlasLatencyMarks, 'generation' | 'origin' | 't0'>

export function createLatencyMarks(
  generation: number,
  origin: LatencyOrigin,
  t0: number,
): AtlasLatencyMarks {
  return { generation, origin, t0 }
}

/**
 * Record a stage, once, for the request that is actually current.
 *
 * Returns whether the write happened, which is what makes "captured exactly
 * once" and "a new request cannot inherit the previous one's marks" testable
 * rather than merely asserted.
 */
export function markOnce(
  marks: AtlasLatencyMarks,
  generation: number,
  mark: AtlasLatencyMark,
  at: number,
): boolean {
  if (marks.generation !== generation) return false
  if (marks[mark] !== undefined) return false
  marks[mark] = at
  return true
}

/**
 * Merge a timing frame into what we already know.
 *
 * The route now emits timing TWICE — once as soon as the first token proves
 * `contextMs` and `firstTokenMs`, and again at the end for `serverTotalMs`.
 * A plain assignment would let the second frame erase the first, so every
 * field falls back to the value already held. Later frames may add; they may
 * never subtract.
 */
export function mergeServerTiming(
  previous: AtlasServerTiming | undefined,
  incoming: AtlasServerTiming | undefined,
): AtlasServerTiming {
  const base = previous ?? {}
  if (!incoming) return base
  return {
    contextMs:     incoming.contextMs     ?? base.contextMs,
    firstTokenMs:  incoming.firstTokenMs  ?? base.firstTokenMs,
    serverTotalMs: incoming.serverTotalMs ?? base.serverTotalMs,
  }
}

/** ms below a second, seconds above it — readable at both scales. */
export function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
}

/**
 * The compact diagnostic readout.
 *
 * Labels are literal about what they measure. `TTFT` is request-start to first
 * token and therefore INCLUDES server context assembly — `ctx` is printed
 * beside it precisely so the two can be told apart. Calling it "model latency"
 * would be a lie by a few hundred milliseconds.
 *
 * Stages that were never reached are omitted rather than shown as zero.
 * Returns null until there is audible speech to anchor the headline, which
 * preserves the existing behaviour of showing nothing on a silent response.
 */
export function formatLatency(
  marks: AtlasLatencyMarks,
  timing?: AtlasServerTiming,
): string | null {
  if (marks.firstAudio === undefined) return null
  const total = Math.round(marks.firstAudio - marks.t0)
  if (!(total > 0)) return null

  const parts: string[] = []
  if (timing?.contextMs !== undefined) parts.push(`ctx ${formatDuration(timing.contextMs)}`)
  if (timing?.firstTokenMs !== undefined) parts.push(`TTFT ${formatDuration(timing.firstTokenMs)}`)
  if (marks.firstSentence !== undefined) {
    parts.push(`mening ${formatDuration(marks.firstSentence - marks.t0)}`)
  }
  if (marks.ttsStart !== undefined && marks.ttsBlobReady !== undefined) {
    parts.push(`TTS ${formatDuration(marks.ttsBlobReady - marks.ttsStart)}`)
  }
  if (marks.playbackHandoff !== undefined) {
    parts.push(`ljud ${formatDuration(marks.firstAudio - marks.playbackHandoff)}`)
  }

  const headline = `⚡ ${formatDuration(total)}`
  return parts.length ? `${headline} · ${parts.join(' · ')}` : headline
}
