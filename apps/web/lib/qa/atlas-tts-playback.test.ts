/**
 * Atlas TTS playback lifecycle.
 *
 * A production smoke found the orb showing `speaking` while the operator heard
 * nothing at all. The provider was fine — the TTS blob existed — and every
 * layer below it swallowed its own failure, so silence and speech were
 * indistinguishable to the UI.
 *
 * These tests pin the properties that make that state unreachable: the phase
 * follows real playback rather than a blob, a rejected play() is an outcome
 * rather than a completion, the object URL is always released, and the result
 * settles exactly once no matter which callbacks race.
 *
 * Everything is deterministic: no provider, no microphone, no speaker, no
 * network, no real time.
 */

import { describe, expect, it, vi } from 'vitest'
import type { AtlasAudioRoute } from '@/lib/atlas/audio-analysis'
import { classifyPlaybackError, playTtsUrl, type PlaybackAnalyser } from '@/lib/atlas/playback'

/** Lets the module's internal async chain reach `audio.play()`. */
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function fakeAudio(play: () => Promise<void> = async () => {}) {
  const listeners = new Map<string, Set<() => void>>()
  return {
    play: vi.fn(play),
    pause: vi.fn(),
    addEventListener: vi.fn((type: string, handler: () => void) => {
      const set = listeners.get(type) ?? new Set<() => void>()
      set.add(handler)
      listeners.set(type, set)
    }),
    removeEventListener: vi.fn((type: string, handler: () => void) => {
      listeners.get(type)?.delete(handler)
    }),
    emit(type: string) {
      for (const handler of [...(listeners.get(type) ?? [])]) handler()
    },
    listenerCount() {
      let total = 0
      for (const set of listeners.values()) total += set.size
      return total
    },
  }
}

function routingAnalyser(route: AtlasAudioRoute = 'routed') {
  return { prepare: vi.fn(async () => route), disconnect: vi.fn() } satisfies PlaybackAnalyser & {
    prepare: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }
}

function play(audio: ReturnType<typeof fakeAudio>, extra: Record<string, unknown> = {}) {
  const revokeObjectUrl = vi.fn()
  const onStart = vi.fn()
  const handle = playTtsUrl('blob:segment-1', {
    createAudio: () => audio as unknown as HTMLAudioElement,
    revokeObjectUrl,
    analyser: routingAnalyser(),
    onStart,
    ...extra,
  })
  return { handle, revokeObjectUrl, onStart }
}

describe('Atlas TTS playback · speaking follows real audio', () => {
  it('does not report a start merely because a blob and an element exist', async () => {
    // play() resolves — the request was accepted — but no `playing` event ever
    // arrives. This is precisely the silent-orb case from production.
    const audio = fakeAudio()
    const { onStart } = play(audio)
    await tick()

    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('reports a start only on the browser playing event', async () => {
    const audio = fakeAudio()
    const { onStart } = play(audio)
    await tick()
    expect(onStart).not.toHaveBeenCalled()

    audio.emit('playing')
    expect(onStart).toHaveBeenCalledTimes(1)
  })

  it('runs the full happy lifecycle: playing → started, ended → completed', async () => {
    const audio = fakeAudio()
    const { handle, onStart, revokeObjectUrl } = play(audio)
    await tick()

    audio.emit('playing')
    audio.emit('ended')

    await expect(handle.result).resolves.toEqual({ status: 'completed', code: null, started: true })
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:segment-1')
  })
})

describe('Atlas TTS playback · failures are outcomes, never completions', () => {
  it('surfaces an autoplay denial instead of passing for speech', async () => {
    const denial = Object.assign(new Error('blocked'), { name: 'NotAllowedError' })
    const audio = fakeAudio(async () => { throw denial })
    const { handle, onStart, revokeObjectUrl } = play(audio)

    const outcome = await handle.result
    expect(outcome).toEqual({
      status: 'blocked',
      code: 'ATLAS_TTS_PLAYBACK_BLOCKED',
      started: false,
    })
    // The queue advanced (the promise settled) without ever claiming speech.
    expect(onStart).not.toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:segment-1')
  })

  it('reports a media error as a failure', async () => {
    const audio = fakeAudio()
    const { handle } = play(audio)
    await tick()

    audio.emit('error')
    await expect(handle.result).resolves.toEqual({
      status: 'failed',
      code: 'ATLAS_TTS_PLAYBACK_FAILED',
      started: false,
    })
  })

  it('refuses to play only a captured element with nowhere to go', async () => {
    // `unusable` is the one case where playing would be silent-but-"speaking":
    // the element belongs to the graph and the graph reaches no speakers.
    const audio = fakeAudio()
    const { handle, onStart } = play(audio, { analyser: routingAnalyser('unusable') })

    await expect(handle.result).resolves.toEqual({
      status: 'failed',
      code: 'ATLAS_TTS_PLAYBACK_FAILED',
      started: false,
    })
    expect(audio.play).not.toHaveBeenCalled()
    expect(onStart).not.toHaveBeenCalled()
  })

  it('classifies playback errors by their DOMException name', () => {
    expect(classifyPlaybackError({ name: 'NotAllowedError' })).toBe('blocked')
    expect(classifyPlaybackError({ name: 'SecurityError' })).toBe('blocked')
    expect(classifyPlaybackError({ name: 'AbortError' })).toBe('cancelled')
    expect(classifyPlaybackError({ name: 'NotSupportedError' })).toBe('failed')
    expect(classifyPlaybackError(new Error('anything'))).toBe('failed')
    expect(classifyPlaybackError(null)).toBe('failed')
  })

  it('does not warn the operator about an interruption', async () => {
    const abort = Object.assign(new Error('interrupted'), { name: 'AbortError' })
    const audio = fakeAudio(async () => { throw abort })
    const { handle } = play(audio)

    const outcome = await handle.result
    expect(outcome.status).toBe('cancelled')
    // No code means no warning surfaces — an interruption is not a fault.
    expect(outcome.code).toBeNull()
  })
})

describe('Atlas TTS playback · settles exactly once', () => {
  it('keeps the first outcome when ended, error and stop all race', async () => {
    const audio = fakeAudio()
    const { handle, revokeObjectUrl } = play(audio)
    await tick()

    audio.emit('playing')
    audio.emit('ended')
    audio.emit('error')
    handle.stop()
    handle.stop()

    await expect(handle.result).resolves.toEqual({ status: 'completed', code: null, started: true })
    // The single observable proof of single settlement.
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1)
    expect(audio.pause).not.toHaveBeenCalled()
  })

  it('detaches every listener and releases the analyser on settlement', async () => {
    const audio = fakeAudio()
    const analyser = routingAnalyser()
    const { handle } = play(audio, { analyser })
    await tick()
    expect(audio.listenerCount()).toBeGreaterThan(0)

    audio.emit('ended')
    await handle.result

    expect(audio.listenerCount()).toBe(0)
    expect(analyser.disconnect).toHaveBeenCalledTimes(1)
  })

  it('stop() pauses, cancels and revokes exactly once', async () => {
    const audio = fakeAudio()
    const { handle, revokeObjectUrl } = play(audio)
    await tick()
    audio.emit('playing')

    handle.stop()

    await expect(handle.result).resolves.toEqual({ status: 'cancelled', code: null, started: true })
    expect(audio.pause).toHaveBeenCalledTimes(1)
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1)
  })

  it('ignores a playing event that arrives after settlement', async () => {
    const audio = fakeAudio()
    const { handle, onStart } = play(audio)
    await tick()

    audio.emit('error')
    await handle.result
    audio.emit('playing')

    expect(onStart).not.toHaveBeenCalled()
  })
})

describe('Atlas TTS playback · analyser problems never silence Atlas', () => {
  it('plays the element directly when Web Audio never captured it', async () => {
    // The correction: `direct` is not a failure. Web Audio could not start, the
    // element is untouched, and ordinary media playback is exactly right.
    const audio = fakeAudio()
    const analyser = routingAnalyser('direct')
    const { handle, onStart } = play(audio, { analyser })
    await tick()

    expect(analyser.prepare).toHaveBeenCalledTimes(1)
    expect(audio.play).toHaveBeenCalledTimes(1)

    audio.emit('playing')
    expect(onStart).toHaveBeenCalledTimes(1)

    audio.emit('ended')
    await expect(handle.result).resolves.toEqual({ status: 'completed', code: null, started: true })
  })

  it('plays directly when a suspended context timed out before capture', async () => {
    // What AtlasAudioAnalyser reports after its bounded resume gives up. The
    // element was never captured, so speech must still be attempted.
    const audio = fakeAudio()
    const { handle, onStart } = play(audio, { analyser: routingAnalyser('direct') })
    await tick()

    expect(audio.play).toHaveBeenCalledTimes(1)
    audio.emit('playing')
    audio.emit('ended')

    expect(onStart).toHaveBeenCalledTimes(1)
    await expect(handle.result).resolves.toEqual({ status: 'completed', code: null, started: true })
  })

  it('still plays when the analyser attached but visualisation failed', async () => {
    // `routed` covers "captured, destination live, analyser dead".
    const audio = fakeAudio()
    const { handle } = play(audio, { analyser: routingAnalyser('routed') })
    await tick()

    expect(audio.play).toHaveBeenCalledTimes(1)
    audio.emit('playing')
    audio.emit('ended')
    await expect(handle.result).resolves.toEqual({ status: 'completed', code: null, started: true })
  })

  it('plays directly when there is no analyser at all', async () => {
    const audio = fakeAudio()
    const { handle } = play(audio, { analyser: null })
    await tick()

    expect(audio.play).toHaveBeenCalledTimes(1)
    audio.emit('playing')
    audio.emit('ended')
    await expect(handle.result).resolves.toEqual({ status: 'completed', code: null, started: true })
  })

  it('does not let the direct fallback hide an autoplay denial', async () => {
    // The fallback must not paper over the browser's own refusal — otherwise
    // we would have swapped one silent lie for another.
    const denial = Object.assign(new Error('blocked'), { name: 'NotAllowedError' })
    const audio = fakeAudio(async () => { throw denial })
    const { handle, onStart } = play(audio, { analyser: routingAnalyser('direct') })

    await expect(handle.result).resolves.toEqual({
      status: 'blocked',
      code: 'ATLAS_TTS_PLAYBACK_BLOCKED',
      started: false,
    })
    expect(onStart).not.toHaveBeenCalled()
  })
})
