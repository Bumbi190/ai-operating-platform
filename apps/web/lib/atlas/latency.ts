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

/** Request-local durations emitted by the chat route. */
export interface AtlasServerTiming {
  contextMs?: number
  /** Route start to entry into the first governed Anthropic stream call. Includes context. */
  modelStartMs?: number
  /** Governed wrapper returned a stream handle; the remaining gap is provider/token time. */
  streamReadyMs?: number
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
  /** Browser begins the same-origin `/api/chat` fetch. */
  chatRequestStart?: number
  /** Browser receives `/api/chat` response headers. */
  chatHeadersReceived?: number
  sent?: number
  /** First text SSE event reaches the browser callback. */
  firstSseTextReceived?: number
  firstByte?: number
  /** First streamed text committed to the visible React surface. */
  firstDomVisible?: number
  firstVisible?: number
  /** First complete segment safe to hand to speech. */
  firstSpeakable?: number
  firstSentence?: number
  ttsRequestStart?: number
  ttsStart?: number
  /** TTS response headers arrived; its body may still be streaming. */
  ttsHeadersReceived?: number
  ttsResponse?: number
  /** First body chunk is readable by the client. */
  ttsFirstBodyByte?: number
  /** The complete first-segment response body has arrived. */
  ttsBodyComplete?: number
  ttsBlobReady?: number
  /** The blob is handed to the playback module. NOT `audio.play()` — see below. */
  playbackHandoff?: number
  playCalled?: number
  playPromiseResolved?: number
  playPromiseRejected?: number
  loadedMetadata?: number
  canPlay?: number
  waiting?: number
  stalled?: number
  playbackError?: number
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
    modelStartMs:  incoming.modelStartMs  ?? base.modelStartMs,
    streamReadyMs: incoming.streamReadyMs ?? base.streamReadyMs,
    firstTokenMs:  incoming.firstTokenMs  ?? base.firstTokenMs,
    serverTotalMs: incoming.serverTotalMs ?? base.serverTotalMs,
  }
}

function relative(marks: AtlasLatencyMarks, mark: keyof AtlasLatencyMarks): string | null {
  const value = marks[mark]
  return typeof value === 'number' ? formatDuration(value - marks.t0) : null
}

/**
 * Complete client-local timeline for the current request.
 *
 * Every client value is rendered relative to the same `performance.now()` T0;
 * server durations stay explicitly server-relative so clocks are never mixed.
 * Missing transitions are omitted, never inferred.
 */
export function formatRawLatency(
  marks: AtlasLatencyMarks,
  timing?: AtlasServerTiming,
): string {
  const client: Array<[string, keyof AtlasLatencyMarks]> = [
    [marks.origin === 'voice' ? 'voiceT0' : 'typedT0', 't0'],
    ['chatRequestStart', 'chatRequestStart'],
    ['chatHeadersReceived', 'chatHeadersReceived'],
    ['firstSseTextReceived', 'firstSseTextReceived'],
    ['firstDomVisible', 'firstDomVisible'],
    ['firstSpeakable', 'firstSpeakable'],
    ['ttsRequestStart', 'ttsRequestStart'],
    ['ttsHeadersReceived', 'ttsHeadersReceived'],
    ['ttsFirstBodyByte', 'ttsFirstBodyByte'],
    ['ttsBodyComplete', 'ttsBodyComplete'],
    ['playbackHandoff', 'playbackHandoff'],
    ['playCalled', 'playCalled'],
    ['playPromiseResolved', 'playPromiseResolved'],
    ['playPromiseRejected', 'playPromiseRejected'],
    ['loadedmetadata', 'loadedMetadata'],
    ['canplay', 'canPlay'],
    ['waiting', 'waiting'],
    ['stalled', 'stalled'],
    ['playing', 'firstAudio'],
    ['error', 'playbackError'],
  ]

  const clientParts = client.flatMap(([label, mark]) => {
    if (mark === 't0') return [`${label}=0ms`]
    const value = relative(marks, mark)
    return value === null ? [] : [`${label}=${value}`]
  })
  const serverParts = [
    timing?.contextMs === undefined ? null : `contextFinished=${formatDuration(timing.contextMs)}`,
    timing?.modelStartMs === undefined ? null : `modelStart=${formatDuration(timing.modelStartMs)}`,
    timing?.streamReadyMs === undefined ? null : `streamReady=${formatDuration(timing.streamReadyMs)}`,
    timing?.firstTokenMs === undefined ? null : `firstToken=${formatDuration(timing.firstTokenMs)}`,
    timing?.serverTotalMs === undefined ? null : `serverDone=${formatDuration(timing.serverTotalMs)}`,
  ].filter((value): value is string => value !== null)

  return `raw-client ${clientParts.join(' · ')}${serverParts.length ? ` | raw-server requestReceived=0ms · ${serverParts.join(' · ')}` : ''}`
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
 * Visible text is useful before audio exists, so the readout appears at the
 * first committed text and grows as later stages become known.
 */
export function formatLatency(
  marks: AtlasLatencyMarks,
  timing?: AtlasServerTiming,
): string | null {
  const textAt = marks.firstVisible ?? marks.firstByte
  if (textAt === undefined) return null
  const textMs = Math.round(textAt - marks.t0)
  if (!(textMs >= 0)) return null

  const parts: string[] = []
  if (timing?.contextMs !== undefined) parts.push(`ctx ${formatDuration(timing.contextMs)}`)
  if (timing?.firstTokenMs !== undefined) parts.push(`TTFT ${formatDuration(timing.firstTokenMs)}`)
  if (marks.firstSpeakable !== undefined) {
    parts.push(`segment ${formatDuration(marks.firstSpeakable - marks.t0)}`)
  }
  if (marks.ttsStart !== undefined && marks.ttsBlobReady !== undefined) {
    parts.push(`TTS ${formatDuration(marks.ttsBlobReady - marks.ttsStart)}`)
  }
  if (marks.playbackHandoff !== undefined && marks.firstAudio !== undefined) {
    parts.push(`ljud ${formatDuration(marks.firstAudio - marks.playbackHandoff)}`)
  }

  const headline = marks.firstAudio === undefined
    ? `⚡ text ${formatDuration(textMs)}`
    : `⚡ text ${formatDuration(textMs)} · audio ${formatDuration(marks.firstAudio - marks.t0)}`
  return parts.length ? `${headline} · ${parts.join(' · ')}` : headline
}
