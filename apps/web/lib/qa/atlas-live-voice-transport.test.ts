import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAtlasLiveVoiceTransport } from '@/lib/atlas/live-voice/transport'

const deferred = <T>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }

function fixture() {
  const track = { enabled: true, stop: vi.fn() }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  class Channel extends EventTarget {
    readyState = 'open'
    send = vi.fn()
    close = vi.fn(() => { this.readyState = 'closed'; this.dispatchEvent(new Event('close')) })
    message(raw: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(raw) })) }
  }
  const channel = new Channel()
  class Peer extends EventTarget {
    connectionState = 'new'
    localDescription: { sdp: string } | null = null
    addTrack = vi.fn()
    createDataChannel = vi.fn(() => channel)
    createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'offer' }))
    setLocalDescription = vi.fn(async (offer: { sdp: string }) => { this.localDescription = offer })
    setRemoteDescription = vi.fn(async () => undefined)
    close = vi.fn(() => { this.connectionState = 'closed'; this.dispatchEvent(new Event('connectionstatechange')) })
  }
  const peer = new Peer()
  const audio = { autoplay: false, srcObject: null as unknown, play: vi.fn(async (): Promise<void> => undefined), pause: vi.fn() }
  const exchange = vi.fn(async (_body: unknown, _signal: AbortSignal) => ({ sessionId: 'session-a', sdp: 'answer' }))
  const onEvent = vi.fn(), onNotice = vi.fn()
  const getUserMedia = vi.fn(async (_constraints: unknown) => stream as unknown as MediaStream)
  const deps = {
    getUserMedia, createPeer: vi.fn(() => peer as unknown as RTCPeerConnection),
    createAudio: () => audio as unknown as HTMLAudioElement,
    createRemoteStream: vi.fn(() => stream as unknown as MediaStream),
  }
  const transport = createAtlasLiveVoiceTransport({ voice: 'cedar', exchange, onEvent, onNotice }, deps)
  let eventNumber = 0
  const emit = (type: string, rest: object = {}) => channel.message({ type, event_id: 'event-' + ++eventNumber, ...rest })
  const started = () => emit('session.started', { session: { id: 'session-a' } })
  const finalized = (seconds: number, sessionId = 'session-a') => emit('session.closed', { session: { id: sessionId }, usage: { seconds }, reason: 'close_requested' })
  const remoteAudio = () => peer.dispatchEvent(Object.assign(new Event('track'), { track: { stop: vi.fn() }, streams: [] }))
  return { transport, track, stream, channel, peer, audio, exchange, deps, emit, started, finalized, remoteAudio, onEvent, onNotice }
}

afterEach(() => vi.useRealTimers())

describe('isolated Live WebRTC lifecycle', () => {
  it('uses echo cancellation and leaves the microphone active during incoming audio and transcript', async () => {
    const f = fixture(); await f.transport.connect(); f.started(); f.remoteAudio()
    f.emit('session.output_transcript.delta', { delta: 'Hej André.', start_ms: 0, end_ms: 100 })
    expect(f.deps.getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    expect(f.peer.addTrack).toHaveBeenCalledWith(f.track, f.stream)
    expect(f.track.enabled).toBe(true); expect(f.track.stop).not.toHaveBeenCalled()
    expect(f.audio.play).toHaveBeenCalledOnce()
    expect(f.transport.snapshot().phase).toBe('connected')
    // A transcript fragment must not manufacture an audible-speaking state.
    expect(f.transport.snapshot()).not.toHaveProperty('speaking')
    f.finalized(0)
  })

  it('keeps signaling credentials and trusted configuration out of the browser request', async () => {
    const f = fixture(); await f.transport.connect()
    expect(f.exchange).toHaveBeenCalledWith({ sdp: 'offer', voice: 'cedar' }, expect.any(AbortSignal))
    expect(f.peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'answer' })
    expect(f.peer.createDataChannel).toHaveBeenCalledWith('oai-events')
    f.finalized(0)
  })

  it('never retries or opens a second session on repeated connect', async () => {
    const f = fixture(); await f.transport.connect()
    await expect(f.transport.connect()).rejects.toThrow('live_transport_one_shot')
    expect(f.exchange).toHaveBeenCalledOnce(); f.finalized(0)
  })

  it('denied microphone permission costs no signaling and creates no peer', async () => {
    const f = fixture(); f.deps.getUserMedia.mockRejectedValueOnce(new Error('denied'))
    await expect(f.transport.connect()).rejects.toThrow('live_connection_failed')
    expect(f.exchange).not.toHaveBeenCalled(); expect(f.deps.createPeer).not.toHaveBeenCalled()
    expect(f.transport.snapshot().phase).toBe('failed')
  })

  it('stopping during permission releases a late stream without starting signaling', async () => {
    const f = fixture(), mic = deferred<MediaStream>(); f.deps.getUserMedia.mockReturnValueOnce(mic.promise)
    const connecting = f.transport.connect(); await f.transport.close()
    mic.resolve(f.stream as unknown as MediaStream); await connecting
    expect(f.track.stop).toHaveBeenCalledOnce(); expect(f.exchange).not.toHaveBeenCalled()
    expect(f.deps.createPeer).not.toHaveBeenCalled(); expect(f.transport.snapshot().phase).toBe('closed')
  })

  it('stopping during signaling aborts the request and ignores a late answer', async () => {
    const f = fixture(), answer = deferred<{ sessionId: string; sdp: string }>()
    f.exchange.mockReturnValueOnce(answer.promise)
    const connecting = f.transport.connect(); await vi.waitFor(() => expect(f.exchange).toHaveBeenCalledOnce())
    await f.transport.close(); expect(f.exchange.mock.calls[0][1].aborted).toBe(true)
    answer.resolve({ sessionId: 'session-a', sdp: 'late-answer' }); await connecting
    expect(f.peer.setRemoteDescription).not.toHaveBeenCalled(); expect(f.track.stop).toHaveBeenCalledOnce()
  })

  it.each(['signaling', 'remote-description'])('cleans resources after %s failure and reports unknown final usage', async failure => {
    const f = fixture()
    if (failure === 'signaling') f.exchange.mockRejectedValueOnce(new Error('private provider failure'))
    else f.peer.setRemoteDescription.mockRejectedValueOnce(new Error('bad SDP'))
    await expect(f.transport.connect()).rejects.toThrow('live_connection_failed')
    expect(f.track.stop).toHaveBeenCalledOnce(); expect(f.peer.close).toHaveBeenCalledOnce()
    expect(await f.transport.close()).toEqual({ confirmed: false, seconds: null, reason: null })
  })

  it('reports autoplay blocking separately and can resume audio from a user gesture', async () => {
    const f = fixture(); f.audio.play.mockRejectedValueOnce(new Error('NotAllowedError'))
    await f.transport.connect(); f.started(); f.remoteAudio()
    await vi.waitFor(() => expect(f.transport.snapshot().audioBlocked).toBe(true))
    expect(f.onNotice).toHaveBeenCalledWith('audio_playback_blocked')
    expect(f.track.enabled).toBe(true)
    await f.transport.resumeAudio(); expect(f.transport.snapshot().audioBlocked).toBe(false)
    f.finalized(0)
  })

  it('replaces cumulative usage, ignores regressions and counts final usage once', async () => {
    const f = fixture(); await f.transport.connect(); f.started()
    f.emit('session.usage.updated', { usage: { seconds: 12 } })
    f.emit('session.usage.updated', { usage: { seconds: 15 } })
    f.emit('session.usage.updated', { usage: { seconds: 10 } })
    expect(f.transport.snapshot().observedSeconds).toBe(15)
    const closing = f.transport.close(); f.finalized(16); f.finalized(17)
    expect(await closing).toEqual({ confirmed: true, seconds: 16, reason: 'close_requested' })
    expect(f.track.stop).toHaveBeenCalledOnce(); expect(f.peer.close).toHaveBeenCalledOnce()
  })

  it('silences local audio immediately while waiting for a valid final event', async () => {
    const f = fixture(); await f.transport.connect(); f.started(); f.remoteAudio()
    const closing = f.transport.close(), closingAgain = f.transport.close()
    expect(f.audio.pause).toHaveBeenCalledOnce(); expect(f.audio.srcObject).toBeNull()
    expect(f.track.stop).toHaveBeenCalledOnce(); expect(f.channel.close).not.toHaveBeenCalled()
    expect(f.channel.send).toHaveBeenCalledWith(JSON.stringify({ type: 'session.close' }))
    f.finalized(5)
    expect(await closing).toEqual(await closingAgain)
    expect(f.channel.close).toHaveBeenCalledOnce()
  })

  it('rejects foreign identities, invalid JSON and regressing final usage', async () => {
    vi.useFakeTimers(); const f = fixture(); await f.transport.connect(); f.started()
    f.emit('session.usage.updated', { usage: { seconds: 15 } })
    const closing = f.transport.close()
    f.channel.dispatchEvent(new MessageEvent('message', { data: '{invalid' }))
    f.finalized(16, 'foreign'); f.finalized(14)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await closing).toEqual({ confirmed: false, seconds: null, reason: null })
    expect(f.transport.snapshot().observedSeconds).toBe(15)
  })

  it('preserves usage received while closing and refuses a final report below it', async () => {
    vi.useFakeTimers(); const f = fixture(); await f.transport.connect(); f.started()
    f.emit('session.usage.updated', { usage: { seconds: 5 } })
    const closing = f.transport.close()
    f.emit('session.usage.updated', { usage: { seconds: 20 } })
    expect(f.transport.snapshot().observedSeconds).toBe(20)
    f.finalized(10)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await closing).toEqual({ confirmed: false, seconds: null, reason: null })
    expect(f.track.stop).toHaveBeenCalledOnce()
  })

  it('does not count a dropped channel as confirmed zero-cost completion', async () => {
    const f = fixture(); await f.transport.connect(); f.started(); f.channel.dispatchEvent(new Event('close'))
    expect(await f.transport.close()).toEqual({ confirmed: false, seconds: null, reason: null })
    expect(f.track.stop).toHaveBeenCalledOnce(); expect(f.transport.snapshot().phase).toBe('failed')
  })

  it('cleans up on a peer failure and ignores later transcript and playback callbacks', async () => {
    const f = fixture(), playing = deferred<void>(); f.audio.play.mockReturnValueOnce(playing.promise)
    await f.transport.connect(); f.started(); f.remoteAudio()
    f.peer.connectionState = 'failed'; f.peer.dispatchEvent(new Event('connectionstatechange'))
    const count = f.onEvent.mock.calls.length
    f.emit('session.output_transcript.delta', { delta: 'För sent', start_ms: 0, end_ms: 100 })
    playing.reject(new Error('late rejection')); await Promise.resolve(); await Promise.resolve()
    expect(f.onEvent).toHaveBeenCalledTimes(count); expect(f.transport.snapshot().phase).toBe('failed')
    expect(f.transport.snapshot().audioBlocked).toBe(false); expect(f.track.stop).toHaveBeenCalledOnce()
  })

  it('ignores a started event for another session', async () => {
    const f = fixture(); await f.transport.connect()
    f.emit('session.started', { session: { id: 'other' } })
    expect(f.transport.snapshot().phase).toBe('connecting'); f.finalized(0)
  })

  it('provider errors end the connection without exposing raw provider details', async () => {
    const f = fixture(); await f.transport.connect(); f.started()
    f.emit('error', { error: { code: 'invalid_request', message: 'sensitive detail' } })
    expect(f.transport.snapshot().phase).toBe('failed')
    expect(f.onNotice).toHaveBeenCalledWith('live_provider_error')
    expect(JSON.stringify(f.onEvent.mock.calls)).not.toContain('sensitive detail')
    expect(await f.transport.close()).toEqual({ confirmed: false, seconds: null, reason: null })
  })
})
