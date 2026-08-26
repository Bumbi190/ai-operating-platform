/**
 * lib/atlas/playback.ts — the audible half of Atlas' voice.
 *
 * A production smoke found the orb showing `speaking` while the operator heard
 * nothing. The cause was not the provider: the TTS request had succeeded and a
 * blob existed. Everything downstream of that blob swallowed its own failures,
 * so silence and speech were indistinguishable to the UI.
 *
 * This module owns one spoken segment from object URL to terminal outcome, and
 * it is deliberately a plain function rather than part of the React provider so
 * the lifecycle can be tested without a DOM, a speaker or a network.
 *
 * THREE RULES, ALL OF WHICH WERE PREVIOUSLY BROKEN:
 *
 *   1. `started` becomes true on the element's `playing` event, never on the
 *      existence of a blob and never on the call to `play()`. A promise that
 *      resolves is a request accepted, not audio leaving the speakers.
 *   2. A rejected `play()` is an outcome, not a completion. Autoplay policy
 *      denials are reported so the operator can be told why Atlas went quiet.
 *   3. The result settles EXACTLY once. `playing`, `ended`, `error`, a rejected
 *      `play()` and an external stop all race by construction, so every path
 *      funnels through one guarded `settle`, which is also the only place the
 *      object URL is revoked.
 */

import type { AtlasServiceErrorCode } from './provider-errors'

/** What actually happened to one spoken segment. */
export type PlaybackStatus =
  /** The browser played it through to the end. */
  | 'completed'
  /** The browser refused to start playback at all (autoplay policy). */
  | 'blocked'
  /** The element reported a media error, or playback could not be performed. */
  | 'failed'
  /** The operator interrupted, or the runtime tore the segment down. */
  | 'cancelled'

export interface PlaybackResult {
  status: PlaybackStatus
  /** Set only when the operator should be told something. */
  code: AtlasServiceErrorCode | null
  /**
   * Whether audible playback ever began. This is the ONLY evidence that
   * justifies the `speaking` phase — see rule 1 above.
   */
  started: boolean
}

/** The analyser seam, narrowed to what playback actually needs from it. */
export interface PlaybackAnalyser {
  /** Resolves true when the element is safe to play and routed to output. */
  connect(audio: HTMLAudioElement): Promise<boolean>
  disconnect(): void
}

export interface PlaybackDeps {
  createAudio?: (url: string) => HTMLAudioElement
  revokeObjectUrl?: (url: string) => void
  /** Optional. Visualisation never gates audibility. */
  analyser?: PlaybackAnalyser | null
  /** Called the moment the browser reports real playback — never before. */
  onStart?: () => void
}

export interface PlaybackHandle {
  result: Promise<PlaybackResult>
  /** Interrupt this segment. Safe to call after the result has settled. */
  stop: () => void
}

/**
 * Map a rejected `play()` onto a status.
 *
 * `AbortError` is what a browser reports when playback was interrupted by a
 * new load or a pause — that is a cancellation, not a fault, and must not warn
 * the operator. `NotAllowedError` is the autoplay denial we specifically need
 * to surface. Everything else is a genuine failure.
 */
export function classifyPlaybackError(error: unknown): PlaybackStatus {
  const candidate = error as { name?: unknown } | null
  const name = typeof candidate?.name === 'string' ? candidate.name : ''
  if (name === 'AbortError') return 'cancelled'
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked'
  return 'failed'
}

const PLAYBACK_CODES: Record<PlaybackStatus, AtlasServiceErrorCode | null> = {
  completed: null,
  cancelled: null,
  blocked: 'ATLAS_TTS_PLAYBACK_BLOCKED',
  failed: 'ATLAS_TTS_PLAYBACK_FAILED',
}

/**
 * Play one TTS object URL and report what genuinely happened.
 *
 * The returned promise never rejects: a caller draining a queue must be able to
 * advance on every outcome, and a thrown playback error would strand the queue
 * exactly the way the original `.catch(finish)` stranded the truth.
 */
export function playTtsUrl(url: string, deps: PlaybackDeps = {}): PlaybackHandle {
  const createAudio = deps.createAudio ?? ((source: string) => new Audio(source))
  const revokeObjectUrl = deps.revokeObjectUrl ?? ((source: string) => URL.revokeObjectURL(source))
  const analyser = deps.analyser ?? null

  let settled = false
  let started = false
  let resolveResult!: (value: PlaybackResult) => void
  const result = new Promise<PlaybackResult>(resolve => { resolveResult = resolve })

  const audio = createAudio(url)

  const handlePlaying = () => {
    if (settled || started) return
    started = true
    deps.onStart?.()
  }
  const handleEnded = () => settle('completed')
  const handleError = () => settle('failed')

  function detach() {
    audio.removeEventListener('playing', handlePlaying)
    audio.removeEventListener('ended', handleEnded)
    audio.removeEventListener('error', handleError)
  }

  function settle(status: PlaybackStatus) {
    if (settled) return
    settled = true
    detach()
    analyser?.disconnect()
    // The single revocation point. Reaching it means the element can no longer
    // consume the URL, on every path including the ones that used to leak it.
    try { revokeObjectUrl(url) } catch { /* already revoked */ }
    resolveResult({ status, code: PLAYBACK_CODES[status], started })
  }

  audio.addEventListener('playing', handlePlaying)
  audio.addEventListener('ended', handleEnded)
  audio.addEventListener('error', handleError)

  void (async () => {
    // Attaching the analyser is best-effort. It reports whether the element is
    // still safe to play; it never decides whether Atlas may speak.
    let audible = true
    if (analyser) {
      try {
        audible = await analyser.connect(audio)
      } catch {
        audible = false
      }
    }
    if (settled) return

    if (!audible) {
      // The element could not be given a working output path. Saying nothing
      // here is what produced a silent orb, so this is reported, not swallowed.
      settle('failed')
      return
    }

    try {
      await audio.play()
    } catch (error) {
      // A rejected play() is never a completed utterance.
      settle(classifyPlaybackError(error))
    }
  })()

  return {
    result,
    stop() {
      if (settled) return
      try { audio.pause() } catch { /* element already torn down */ }
      settle('cancelled')
    },
  }
}
