import { describe, expect, it, vi } from 'vitest'
import {
  ATLAS_PROGRESSIVE_MIME,
  playProgressiveTtsResponse,
} from '@/lib/atlas/progressive-playback'
import type { PlaybackAnalyser } from '@/lib/atlas/playback'

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0))

function controlledResponse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  let cancelled = 0
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value },
    cancel() { cancelled += 1 },
  })
  return {
    response: new Response(body, { headers: { 'content-type': ATLAS_PROGRESSIVE_MIME } }),
    push(...bytes: number[]) { controller.enqueue(Uint8Array.from(bytes)) },
    close() { controller.close() },
    cancelled: () => cancelled,
  }
}

function fakeAudio(url: string) {
  const listeners = new Map<string, Set<() => void>>()
  return {
    src: url,
    play: vi.fn(async () => {}),
    pause: vi.fn(),
    addEventListener: vi.fn((type: string, handler: () => void) => {
      const handlers = listeners.get(type) ?? new Set<() => void>()
      handlers.add(handler)
      listeners.set(type, handlers)
    }),
    removeEventListener: vi.fn((type: string, handler: () => void) => listeners.get(type)?.delete(handler)),
    emit(type: string) { for (const handler of [...(listeners.get(type) ?? [])]) handler() },
  }
}

class FakeSourceBuffer {
  private listeners = new Map<string, Set<() => void>>()
  readonly appended: Uint8Array[] = []
  failAppend = false

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }
  removeEventListener(type: string, listener: () => void) { this.listeners.get(type)?.delete(listener) }
  appendBuffer(value: BufferSource) {
    const bytes = value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    this.appended.push(Uint8Array.from(bytes))
    queueMicrotask(() => this.emit(this.failAppend ? 'error' : 'updateend'))
  }
  private emit(type: string) { for (const listener of [...(this.listeners.get(type) ?? [])]) listener() }
}

class FakeMediaSource {
  readyState = 'closed'
  readonly sourceBuffer = new FakeSourceBuffer()
  readonly addSourceBuffer = vi.fn((type: string) => {
    expect(type).toBe(ATLAS_PROGRESSIVE_MIME)
    return this.sourceBuffer
  })
  readonly endOfStream = vi.fn(() => { this.readyState = 'ended' })
  private listeners = new Map<string, Set<() => void>>()

  addEventListener(type: string, listener: () => void) {
    const listeners = this.listeners.get(type) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }
  removeEventListener(type: string, listener: () => void) { this.listeners.get(type)?.delete(listener) }
  open() {
    this.readyState = 'open'
    for (const listener of [...(this.listeners.get('sourceopen') ?? [])]) listener()
  }
}

function analyser() {
  return {
    prepare: vi.fn(async () => 'routed' as const),
    disconnect: vi.fn(),
  } satisfies PlaybackAnalyser & {
    prepare: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }
}

function harness(capability: 'supported' | 'unsupported' = 'supported') {
  const mediaSource = new FakeMediaSource()
  const audios: ReturnType<typeof fakeAudio>[] = []
  const createdUrls: string[] = []
  const revoked: string[] = []
  const bodyEvents: string[] = []
  const audioAnalyser = analyser()
  const deps = {
    capability: () => capability,
    createMediaSource: () => mediaSource,
    createObjectUrl: (value: Blob | MediaSource) => {
      const url = value instanceof Blob ? `blob:fallback-${createdUrls.length}` : `blob:mse-${createdUrls.length}`
      createdUrls.push(url)
      return url
    },
    createAudio: (url: string) => {
      const audio = fakeAudio(url)
      audios.push(audio)
      return audio as unknown as HTMLAudioElement
    },
    revokeObjectUrl: (url: string) => { revoked.push(url) },
    analyser: audioAnalyser,
    onBodyEvent: (event: string) => bodyEvents.push(event),
  }
  return { mediaSource, audios, createdUrls, revoked, bodyEvents, audioAnalyser, deps }
}

describe('Atlas progressive first-segment playback', () => {
  it('starts from appended MP3 bytes before the response body completes', async () => {
    const stream = controlledResponse()
    const h = harness()
    const onStart = vi.fn()
    const handle = playProgressiveTtsResponse(stream.response, { ...h.deps, onStart })
    await tick()
    h.mediaSource.open()
    stream.push(1, 2, 3)
    await tick()

    expect(h.mediaSource.sourceBuffer.appended).toHaveLength(1)
    expect(h.bodyEvents).toEqual(['first-byte'])
    h.audios[0].emit('playing')
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(h.bodyEvents).not.toContain('body-complete')

    stream.close()
    await tick()
    h.audios[0].emit('ended')
    await expect(handle.result).resolves.toEqual({ status: 'completed', code: null, started: true })
    expect(h.bodyEvents).toEqual(['first-byte', 'body-complete'])
    expect(h.audioAnalyser.prepare).toHaveBeenCalledTimes(1)
  })

  it('uses one ordinary Blob path when the exact capability probe is unsupported', async () => {
    const stream = controlledResponse()
    const h = harness('unsupported')
    const handle = playProgressiveTtsResponse(stream.response, h.deps)
    stream.push(7, 8)
    stream.close()
    await tick()

    expect(h.mediaSource.addSourceBuffer).not.toHaveBeenCalled()
    expect(h.createdUrls).toEqual(['blob:fallback-0'])
    expect(h.audios).toHaveLength(1)
    h.audios[0].emit('playing')
    h.audios[0].emit('ended')
    await expect(handle.result).resolves.toMatchObject({ status: 'completed', started: true })
  })

  it('falls back exactly once when MSE fails before playing', async () => {
    const stream = controlledResponse()
    const h = harness()
    h.mediaSource.sourceBuffer.failAppend = true
    const handle = playProgressiveTtsResponse(stream.response, h.deps)
    await tick()
    h.mediaSource.open()
    stream.push(1, 2)
    stream.push(3, 4)
    stream.close()
    await tick()
    await tick()

    expect(h.bodyEvents.filter(event => event === 'blob-fallback')).toHaveLength(1)
    expect(h.audios).toHaveLength(2)
    expect(h.audios[0].pause).toHaveBeenCalledTimes(1)
    h.audios[1].emit('playing')
    h.audios[1].emit('ended')
    await expect(handle.result).resolves.toMatchObject({ status: 'completed', started: true })
  })

  it('falls back when MSE setup itself fails before an element exists', async () => {
    const stream = controlledResponse()
    const h = harness()
    const handle = playProgressiveTtsResponse(stream.response, {
      ...h.deps,
      createMediaSource: () => { throw new Error('MediaSource construction failed') },
    })
    stream.push(1, 2, 3)
    stream.close()
    await tick()

    expect(h.bodyEvents.filter(event => event === 'blob-fallback')).toHaveLength(1)
    expect(h.audios).toHaveLength(1)
    h.audios[0].emit('playing')
    h.audios[0].emit('ended')
    await expect(handle.result).resolves.toMatchObject({ status: 'completed', started: true })
  })

  it('never replays through Blob after progressive audio has started', async () => {
    const stream = controlledResponse()
    const h = harness()
    h.mediaSource.sourceBuffer.failAppend = true
    const handle = playProgressiveTtsResponse(stream.response, h.deps)
    await tick()
    h.mediaSource.open()
    h.audios[0].emit('playing')
    stream.push(1, 2, 3)
    stream.close()

    await expect(handle.result).resolves.toEqual({
      status: 'failed',
      code: 'ATLAS_TTS_PLAYBACK_FAILED',
      started: true,
    })
    expect(h.audios).toHaveLength(1)
    expect(h.bodyEvents).not.toContain('blob-fallback')
  })

  it('cancels the reader and active element exactly once', async () => {
    const stream = controlledResponse()
    const h = harness()
    const handle = playProgressiveTtsResponse(stream.response, h.deps)
    await tick()
    handle.stop()
    handle.stop()

    await expect(handle.result).resolves.toEqual({ status: 'cancelled', code: null, started: false })
    expect(stream.cancelled()).toBe(1)
    expect(h.audios[0].pause).toHaveBeenCalledTimes(1)
  })
})
