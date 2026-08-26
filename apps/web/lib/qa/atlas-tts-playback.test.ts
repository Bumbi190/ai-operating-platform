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

function okAnalyser(): PlaybackAnalyser & { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } {
  return { connect: vi.fn(async () => true), disconnect: vi.fn() }
}

function play(audio: ReturnType<typeof fakeAudio>, extra: Record<string, unknown> = {}) {
  const revokeObjectUrl = vi.fn()
  const onStart = vi.fn()
  const handle = playTtsUrl('blob:segment-1', {
    createAudio: () => audio as unknown as HTMLAudioElement,
    revokeObjectUrl,
    analyser: okAnalyser(),
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

  it('treats an analyser that cannot route the element as a failure, not silence', async () => {
    // connect() === false means the element has no working output path. Playing
    // anyway is what produced audio nobody could hear.
    const audio = fakeAudio()
    const analyser: PlaybackAnalyser = { connect: vi.fn(async () => false), disconnect: vi.fn() }
    const { handle, onStart } = play(audio, { analyser })

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
    const analyser = okAnalyser()
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
