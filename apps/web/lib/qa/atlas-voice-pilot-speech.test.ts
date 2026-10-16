import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPcmDecoder, createPcmSpeechPlayer } from '@/lib/atlas/voice-pilot/player'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('streaming PCM speech', () => {
  it('closes the speaker input gate before scheduling audio and reopens it only after the last buffer', async () => {
    const outputActive = vi.fn(), starts: boolean[] = [], sources: any[] = []
    vi.stubGlobal('AudioContext', class {
      state = 'running'; currentTime = 0; destination = {}
      resume = async () => {}; close = async () => {}
      createBuffer(_channels: number, length: number, rate: number) { return { duration: length / rate, copyToChannel() {} } }
      createBufferSource() {
        const source = { connect() {}, disconnect() {}, stop: vi.fn(), onended: null as null | (() => void), buffer: null,
          start() { starts.push(outputActive.mock.calls.at(-1)?.[0] === true) } }
        sources.push(source); return source
      }
    })
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([0, 64, 0, 64])))
    const player = createPcmSpeechPlayer({ notice: vi.fn(), outputActive })
    player.enqueue('Hej', 'anders')
    await vi.waitFor(() => expect(sources).toHaveLength(1))
    expect(starts).toEqual([true]); expect(outputActive).toHaveBeenLastCalledWith(true)
    sources[0].onended()
    expect(outputActive).toHaveBeenLastCalledWith(false)
    player.enqueue('Nästa', 'anders')
    await vi.waitFor(() => expect(sources).toHaveLength(2))
    player.stop(); expect(outputActive).toHaveBeenLastCalledWith(false)
    expect(sources[1].stop).toHaveBeenCalledTimes(1); player.dispose()
  })
  it('preserves signed little-endian samples across odd network chunk boundaries', () => {
    const decoder = createPcmDecoder()
    expect(Array.from(decoder.push(new Uint8Array([0])))).toEqual([])
    expect(Array.from(decoder.push(new Uint8Array([128, 255, 127, 0, 0])))).toEqual([-1, 32767 / 32768, 0])
    expect(() => decoder.finish()).not.toThrow()
    decoder.push(new Uint8Array([1]))
    expect(() => decoder.finish()).toThrow()
  })
  it('plays the first samples before the provider stream ends and keeps chunks in order', async () => {
    let body!: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start(c) { body = c } })
    const push = vi.fn(), request = vi.fn(async () => new Response(stream))
    const player = createPcmSpeechPlayer({ notice: vi.fn() }, { request, sink: { prepare: async () => {}, push, stop: vi.fn(), dispose: vi.fn() } })
    player.enqueue('Hej', 'anders')
    body.enqueue(new Uint8Array([0, 128]))
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1))
    expect(Array.from(push.mock.calls[0][0])).toEqual([-1])
    body.enqueue(new Uint8Array([0, 64])); body.close()
    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(2))
    expect(Array.from(push.mock.calls[1][0])).toEqual([0.5])
    player.dispose()
  })
  it('stops audio and pending fetch and never revives a queued old segment', async () => {
    let answer!: (r: Response) => void
    const request = vi.fn((_text: string, _voice: string, _signal: AbortSignal) => new Promise<Response>(resolve => { answer = resolve }))
    const sink = { prepare: async () => {}, push: vi.fn(), stop: vi.fn(), dispose: vi.fn() }
    const player = createPcmSpeechPlayer({ notice: vi.fn() }, { request, sink })
    player.enqueue('Gammalt', 'anders'); player.enqueue('Också gammalt', 'anders')
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    player.stop()
    expect(request.mock.calls[0][2].aborted).toBe(true)
    answer(new Response(new Uint8Array([0, 64])))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(sink.push).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledTimes(1)
    expect(sink.stop).toHaveBeenCalledTimes(1)
    player.dispose()
  })
  it('reports blocked audio before dispatch, and never retries provider failures', async () => {
    const request = vi.fn(), notice = vi.fn()
    const player = createPcmSpeechPlayer({ notice }, { request, sink: { prepare: async () => { throw new Error('blocked') }, push: vi.fn(), stop: vi.fn(), dispose: vi.fn() } })
    player.enqueue('Hej', 'peter')
    await vi.waitFor(() => expect(notice).toHaveBeenCalledTimes(1))
    expect(request).not.toHaveBeenCalled(); player.dispose()
    const failed = createPcmSpeechPlayer({ notice }, { request: vi.fn(async () => new Response('secret vendor text', { status: 503 })), sink: { prepare: async () => {}, push: vi.fn(), stop: vi.fn(), dispose: vi.fn() } })
    failed.enqueue('Hej', 'anders')
    await vi.waitFor(() => expect(notice).toHaveBeenCalledTimes(2))
    expect(notice.mock.calls.flat().join()).not.toContain('secret vendor text'); failed.dispose()
  })
})
