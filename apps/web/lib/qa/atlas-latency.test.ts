/**
 * Atlas latency instrumentation contracts.
 *
 * The voice path used to report one number — speech-end to first audible word.
 * It was the number the operator feels and it said nothing about where the time
 * went, so it could not settle a single optimisation question.
 *
 * These tests pin the bookkeeping that makes the phases measurable, and — more
 * importantly — the two rules that keep the measurements honest: a stage is
 * recorded once, and a retired request can never write into a live one.
 *
 * Pure module: no provider, no microphone, no speaker, no database, no clock of
 * its own. Every timestamp here is supplied by the test.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createLatencyMarks,
  formatDuration,
  formatLatency,
  markOnce,
  mergeServerTiming,
  type AtlasServerTiming,
} from '@/lib/atlas/latency'

describe('Atlas latency · server timing merges rather than overwrites', () => {
  it('accepts an early frame before the final one', () => {
    // The route proves contextMs and firstTokenMs at first token, and
    // serverTotalMs only at completion.
    const early: AtlasServerTiming = { contextMs: 120, firstTokenMs: 780 }
    const merged = mergeServerTiming(undefined, early)
    expect(merged).toEqual({ contextMs: 120, firstTokenMs: 780, serverTotalMs: undefined })
  })

  it('keeps what the early frame proved when the final frame arrives', () => {
    const early = mergeServerTiming(undefined, { contextMs: 120, firstTokenMs: 780 })
    const final = mergeServerTiming(early, { serverTotalMs: 2400 })

    // A plain assignment here would have erased both earlier fields.
    expect(final).toEqual({ contextMs: 120, firstTokenMs: 780, serverTotalMs: 2400 })
  })

  it('never lets a later frame subtract a known value', () => {
    const known = mergeServerTiming(undefined, { contextMs: 120, firstTokenMs: 780, serverTotalMs: 2400 })
    expect(mergeServerTiming(known, {})).toEqual(known)
    expect(mergeServerTiming(known, undefined)).toEqual(known)
  })

  it('lets a later frame refine a value the early frame did not carry', () => {
    const early = mergeServerTiming(undefined, { firstTokenMs: 780 })
    expect(mergeServerTiming(early, { contextMs: 95 }).contextMs).toBe(95)
  })
})

describe('Atlas latency · each stage is captured exactly once', () => {
  it('records the first speakable segment and ignores later ones', () => {
    const marks = createLatencyMarks(1, 'voice', 0)

    expect(markOnce(marks, 1, 'firstSentence', 1_100)).toBe(true)
    expect(markOnce(marks, 1, 'firstSentence', 1_900)).toBe(false)
    expect(marks.firstSentence).toBe(1_100)
  })

  it('records the first TTS round trip and ignores later segments', () => {
    const marks = createLatencyMarks(1, 'voice', 0)

    expect(markOnce(marks, 1, 'ttsStart', 1_100)).toBe(true)
    expect(markOnce(marks, 1, 'ttsBlobReady', 1_520)).toBe(true)
    // Segment two must not overwrite segment one's round trip.
    expect(markOnce(marks, 1, 'ttsStart', 2_000)).toBe(false)
    expect(markOnce(marks, 1, 'ttsBlobReady', 2_380)).toBe(false)

    expect(marks.ttsBlobReady! - marks.ttsStart!).toBe(420)
  })

  it('records first audio once, from whatever the caller passes as playing', () => {
    const marks = createLatencyMarks(1, 'voice', 0)
    expect(markOnce(marks, 1, 'firstAudio', 1_800)).toBe(true)
    expect(markOnce(marks, 1, 'firstAudio', 2_500)).toBe(false)
    expect(marks.firstAudio).toBe(1_800)
  })
})

describe('Atlas latency · a retired request cannot write into a live one', () => {
  it('rejects a mark carrying an older generation', () => {
    const live = createLatencyMarks(7, 'typed', 5_000)

    // A cancelled response's TTS promise or playback callback resolving late.
    expect(markOnce(live, 6, 'ttsBlobReady', 5_100)).toBe(false)
    expect(markOnce(live, 6, 'firstAudio', 5_200)).toBe(false)
    expect(live.ttsBlobReady).toBeUndefined()
    expect(live.firstAudio).toBeUndefined()
  })

  it('accepts the same mark once the generation matches', () => {
    const live = createLatencyMarks(7, 'typed', 5_000)
    expect(markOnce(live, 7, 'firstAudio', 5_900)).toBe(true)
    expect(live.firstAudio).toBe(5_900)
  })

  it('gives a new request a clean timeline', () => {
    const first = createLatencyMarks(1, 'voice', 0)
    markOnce(first, 1, 'firstSentence', 1_100)
    markOnce(first, 1, 'firstAudio', 1_800)

    const second = createLatencyMarks(2, 'typed', 9_000)
    expect(second.firstSentence).toBeUndefined()
    expect(second.firstAudio).toBeUndefined()
    expect(second.t0).toBe(9_000)
    // The retired timeline keeps its own values; nothing is shared.
    expect(first.firstAudio).toBe(1_800)
  })
})

describe('Atlas latency · T0 depends on how the operator spoke', () => {
  it('anchors a voice request on speech-end', () => {
    const speechEnd = 4_000
    const marks = createLatencyMarks(3, 'voice', speechEnd)
    markOnce(marks, 3, 'firstAudio', 5_800)

    expect(marks.origin).toBe('voice')
    expect(marks.firstAudio! - marks.t0).toBe(1_800)
  })

  it('anchors a typed request on submission, never on a stale speech-end', () => {
    // The runtime consumes its pending speech-end when a voice send starts, so
    // a later typed send has none and falls back to its own submit time.
    const staleSpeechEnd = 4_000
    const typedSubmit = 12_000
    const marks = createLatencyMarks(4, 'typed', typedSubmit)
    markOnce(marks, 4, 'firstAudio', 13_500)

    expect(marks.origin).toBe('typed')
    expect(marks.t0).not.toBe(staleSpeechEnd)
    expect(marks.firstAudio! - marks.t0).toBe(1_500)
  })
})

describe('Atlas latency · compact diagnostic readout', () => {
  const full = () => {
    const marks = createLatencyMarks(1, 'voice', 0)
    markOnce(marks, 1, 'sent', 30)
    markOnce(marks, 1, 'firstByte', 800)
    markOnce(marks, 1, 'firstSentence', 1_100)
    markOnce(marks, 1, 'ttsStart', 1_100)
    markOnce(marks, 1, 'ttsBlobReady', 1_520)
    markOnce(marks, 1, 'playbackHandoff', 1_530)
    markOnce(marks, 1, 'firstAudio', 1_800)
    return marks
  }

  it('formats milliseconds below a second and seconds above it', () => {
    expect(formatDuration(420)).toBe('420ms')
    expect(formatDuration(999)).toBe('999ms')
    expect(formatDuration(1_000)).toBe('1.0s')
    expect(formatDuration(1_800)).toBe('1.8s')
  })

  it('breaks the headline into the phases that were actually reached', () => {
    const readout = formatLatency(full(), { contextMs: 120, firstTokenMs: 780, serverTotalMs: 2_400 })

    expect(readout).toBe('⚡ 1.8s · ctx 120ms · TTFT 780ms · mening 1.1s · TTS 420ms · ljud 270ms')
  })

  it('omits stages that were never reached instead of showing zero', () => {
    const marks = createLatencyMarks(1, 'voice', 0)
    markOnce(marks, 1, 'firstAudio', 1_800)

    expect(formatLatency(marks, undefined)).toBe('⚡ 1.8s')
  })

  it('reports nothing until there is audible speech to anchor it', () => {
    const marks = createLatencyMarks(1, 'voice', 0)
    markOnce(marks, 1, 'firstSentence', 1_100)

    // Preserves today's behaviour: a silent response shows no perf readout.
    expect(formatLatency(marks, { contextMs: 120, firstTokenMs: 780 })).toBeNull()
  })

  it('labels TTFT as request-relative, never as model latency', () => {
    // TTFT includes server context assembly, which is why ctx is printed beside
    // it. The two together are what make the split legible.
    const readout = formatLatency(full(), { contextMs: 120, firstTokenMs: 780 })
    expect(readout).toContain('ctx 120ms')
    expect(readout).toContain('TTFT 780ms')
    expect(readout).not.toContain('model')
  })
})

/**
 * Instrumentation must be invisible in the answer.
 *
 * Mocking the whole chat route — Anthropic, Supabase, fourteen tools and five
 * context builders — to assert one negative would be a large, brittle harness
 * for a property the source states directly. So this is a source contract, the
 * same shape the nav suites use: it pins that timing travels on its own event
 * and that only `text` can reach the visible reply.
 */
describe('Atlas latency · timing never becomes visible content', () => {
  const routeSrc = readFileSync(join(process.cwd(), 'app/api/chat/route.ts'), 'utf8')
  const runtimeSrc = readFileSync(join(process.cwd(), 'lib/atlas/runtime.tsx'), 'utf8')

  it('emits the early frame once, on its own SSE event', () => {
    expect(routeSrc).toContain('let earlyTimingSent = false')
    expect(routeSrc).toContain("send('timing', { reqType, contextMs, firstTokenMs })")
    // Guarded, so a multi-turn tool loop cannot emit it repeatedly.
    expect(routeSrc).toContain('if (!earlyTimingSent) {')
  })

  it('still emits the final frame carrying serverTotalMs', () => {
    expect(routeSrc).toContain("send('timing', { reqType, contextMs, firstTokenMs, serverTotalMs })")
  })

  it('keeps the visible reply fed only by text events', () => {
    // The single accumulation point for what the operator reads and hears.
    const replyAppends = runtimeSrc.match(/reply \+= /g) ?? []
    expect(replyAppends).toHaveLength(1)
    expect(runtimeSrc).toContain("if (d.event === 'text' && d.text) {")
  })

  it('does not touch the reply from the timing branch', () => {
    const timingBranch = runtimeSrc.slice(
      runtimeSrc.indexOf("} else if (d.event === 'timing') {"),
      runtimeSrc.indexOf("} else if (d.event === 'navigate'"),
    )
    expect(timingBranch.length).toBeGreaterThan(0)
    expect(timingBranch).toContain('mergeServerTiming')
    expect(timingBranch).not.toContain('reply')
    expect(timingBranch).not.toContain('setResponse')
  })

  it('leaves first audio bound to the playback module\'s playing event', () => {
    // The merged playback contract stays the only source of `firstAudio`.
    expect(runtimeSrc).toContain("markOnce(marksRef.current, generation, 'firstAudio', performance.now())")
    expect(runtimeSrc).toContain('onStart: () => {')
    const speakingTransitions = runtimeSrc.match(/setVoicePhase\('speaking'\)/g) ?? []
    expect(speakingTransitions).toHaveLength(1)
  })
})
