import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPcmResampler, pcm16 } from '@/lib/atlas/voice-pilot/pcm'
import { createPcmVoiceCapture } from '@/lib/atlas/voice-pilot/pcm-capture'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('bounded microphone PCM', () => {
  it.each([16000, 44100, 48000])('keeps source duration and quiet amplitude across irregular %s Hz frames', rate => {
    const resample = createPcmResampler(rate), output: number[] = []
    for (let offset = 0; offset < rate; offset += 137) {
      output.push(...resample(new Float32Array(Math.min(137, rate - offset)).fill(0.002)))
    }
    expect(output.length).toBeGreaterThanOrEqual(15999)
    expect(output.length).toBeLessThanOrEqual(16000)
    expect(Math.min(...output)).toBeCloseTo(0.002, 7)
    expect(Math.max(...output)).toBeCloseTo(0.002, 7)
  })
  it('encodes signed little-endian PCM and clamps peaks without wrapping', () => {
    const bytes = pcm16(new Float32Array([-2, -1, 0, 1, 2]))
    const view = new DataView(bytes.buffer)
    expect(Array.from({ length: 5 }, (_, i) => view.getInt16(i * 2, true))).toEqual([-32768, -32768, 0, 32767, 32767])
  })
})

function fixture(mode: 'speakers' | 'headphones' = 'speakers') {
  let now = 0
  let frame!: (value: Float32Array, probability: number) => void, grant!: (value: { sampleRate: number; stop(): void }) => void
  let resolve!: (text: string) => void, reject!: (error: Error) => void
  const stop = vi.fn(), receive = vi.fn(), draft = vi.fn(), notice = vi.fn(), interrupt = vi.fn(), active = vi.fn(), listening = vi.fn(), processing = vi.fn(), endpoint = vi.fn()
  const transcribe = vi.fn((_bytes: Uint8Array, _signal: AbortSignal, _reason: 'pause' | 'manual' | 'limit') => new Promise<string>((yes, no) => { resolve = yes; reject = no }))
  const capture = createPcmVoiceCapture({ pauseMs: 2000, playbackMode: mode, receive, draft, notice, interrupt, active, listening, processing, endpoint }, {
    open: callback => { frame = callback; return new Promise(yes => { grant = yes }) }, transcribe, now: () => now,
  })
  return { capture, stop, receive, draft, notice, interrupt, active, listening, processing, transcribe, endpoint, at: (time: number) => { now = time },
    grant: () => grant({ sampleRate: 16000, stop }),
    frames: (amplitude: number, ms: number, probability = amplitude >= 0.0012 ? 0.95 : 0.01) => { for (let t = 0; t < ms; t += 20) frame(new Float32Array(320).fill(amplitude), probability) },
    resolve: async (text: string) => { resolve(text); await Promise.resolve(); await Promise.resolve() },
    reject: async () => { reject(new Error('provider_unavailable')); await Promise.resolve(); await Promise.resolve() },
  }
}

describe('direct audio input without native ASR finalization', () => {
  it('automatically ends after speech followed by steady background sound, without the finish button', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.03, 500, 0.95); f.frames(0.001, 2020, 0.03)
    expect(f.transcribe).toHaveBeenCalledTimes(1)
    expect(f.transcribe.mock.calls[0][2]).toBe('pause')
    await f.resolve('En hel fråga.'); expect(f.receive).toHaveBeenCalledTimes(1)
    f.capture.stop()
  })
  it('automatically ends quiet speech classified as speech, without a minimum volume or manual button', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.0005, 1000, 0.95); f.frames(0.0001, 2020, 0.01)
    expect(f.transcribe).toHaveBeenCalledTimes(1)
    await f.resolve('En lågmäld fråga.'); expect(f.receive).toHaveBeenCalledTimes(1)
    f.capture.stop()
  })

  it('transcribes a quiet short answer with its first sound and sends the complete returned words once', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0, 200); f.frames(0.002, 120); f.frames(0, 1980)
    expect(f.transcribe).not.toHaveBeenCalled()
    f.frames(0, 20)
    expect(f.transcribe).toHaveBeenCalledTimes(1)
    const bytes = f.transcribe.mock.calls[0][0], view = new DataView(bytes.buffer)
    const sound = Array.from({ length: bytes.length / 2 }, (_, i) => view.getInt16(i * 2, true)).filter(v => v > 0)
    expect(sound).toHaveLength(1920)
    expect(f.receive).not.toHaveBeenCalled()
    await f.resolve('Ja, kolla konkurrenterna till Handlarbörsen.')
    expect(f.receive.mock.calls).toEqual([['Ja, kolla konkurrenterna till Handlarbörsen.']])
    expect(f.listening).toHaveBeenLastCalledWith(true)
    f.capture.stop(); expect(f.stop).toHaveBeenCalledTimes(1)
  })
  it('keeps a thinking pause open and ignores room noise and an isolated click', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.0003, 3000); f.frames(0.2, 20); f.frames(0, 2500)
    expect(f.interrupt).not.toHaveBeenCalled(); expect(f.transcribe).not.toHaveBeenCalled()
    f.frames(0.03, 300); f.frames(0, 1600); f.frames(0.02, 200); f.frames(0, 1980)
    expect(f.transcribe).not.toHaveBeenCalled()
    f.frames(0, 20); expect(f.transcribe).toHaveBeenCalledTimes(1)
    f.capture.stop()
  })
  it('offers manual completion even for speech below the activity threshold', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.0005, 3000); f.capture.finish()
    expect(f.transcribe).toHaveBeenCalledTimes(1)
    expect(f.transcribe.mock.calls[0][2]).toBe('manual')
    expect(f.transcribe.mock.calls[0][0].length).toBe(96000)
    await f.resolve('En lågmäld men hel fråga.'); expect(f.receive).toHaveBeenCalledWith('En lågmäld men hel fråga.')
    f.capture.stop()
  })
  it('retains a second around confirmed speech onset without uploading the entire idle period', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.0005, 3000); f.frames(0.02, 200); f.frames(0, 2000)
    const samples = new Int16Array(f.transcribe.mock.calls[0][0].buffer)
    expect(Array.from(samples).filter(n => n === Math.round(0.0005 * 32767))).toHaveLength(14720)
    f.capture.stop()
  })
  it('includes transcription latency in the displayed wait before chat submission', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.02, 200); f.frames(0, 2000); f.at(750); await f.resolve('Hela frågan.')
    expect(f.endpoint).toHaveBeenCalledWith(2750)
    f.capture.stop()
  })
  it.each(['stop', 'discard'] as const)('rejects an in-flight transcription after %s', async action => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.02, 200); f.capture.finish()
    const signal = f.transcribe.mock.calls[0][1]
    f.capture[action]()
    expect(signal.aborted).toBe(true)
    await f.resolve('Det här är gammalt tal.')
    expect(f.receive).not.toHaveBeenCalled(); expect(f.draft).not.toHaveBeenCalled()
    f.capture.stop()
  })
  it('blocks playback and its tail, including stale transcription and pre-roll', async () => {
    vi.useFakeTimers()
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.02, 200); f.capture.finish()
    f.capture.setOutputActive(true); await f.resolve('Ska inte skickas efter att ljudet blockerats.')
    f.frames(0.1, 5000); expect(f.receive).not.toHaveBeenCalled()
    f.capture.setOutputActive(false); vi.advanceTimersByTime(399); f.frames(0.1, 500)
    expect(f.listening).toHaveBeenLastCalledWith(false)
    vi.advanceTimersByTime(1); f.frames(0.002, 200); f.frames(0, 2000)
    await f.resolve('Min nya fråga.'); expect(f.receive.mock.calls).toEqual([['Min nya fråga.']])
    const bytes = f.transcribe.mock.calls[1][0], samples = new Int16Array(bytes.buffer)
    expect(Math.max(...samples)).toBeLessThan(100)
    f.capture.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('releases a late permission grant after stop without starting input', async () => {
    const f = fixture(), start = f.capture.start(); f.capture.stop(); f.grant(); await start
    expect(f.stop).toHaveBeenCalledTimes(1); expect(f.active).not.toHaveBeenCalledWith(true)
  })
  it('does not retry a failed transcription and remains ready for a new question', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.02, 200); f.capture.finish(); await f.reject()
    expect(f.transcribe).toHaveBeenCalledTimes(1); expect(f.notice).toHaveBeenCalledTimes(1)
    expect(f.listening).toHaveBeenLastCalledWith(true)
    f.capture.stop()
  })
  it('requires review of the capped 90-second transcript and never auto-sends a truncated question', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.03, 92000)
    expect(f.transcribe).toHaveBeenCalledTimes(1)
    expect(f.transcribe.mock.calls[0][0].length).toBeLessThanOrEqual(2880000)
    expect(f.stop).toHaveBeenCalledTimes(1)
    await f.resolve('Lång fråga som måste granskas.')
    expect(f.receive).not.toHaveBeenCalled(); expect(f.draft).toHaveBeenCalledWith('Lång fråga som måste granskas.')
    expect(f.notice).toHaveBeenCalled(); expect(f.active).toHaveBeenLastCalledWith(false)
  })
  it('requires review when manual completion would exceed the retained quiet-audio window', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.0005, 92000); f.capture.finish()
    await f.resolve('Tyst tal från en begränsad inspelning.')
    expect(f.receive).not.toHaveBeenCalled()
    expect(f.draft).toHaveBeenCalledWith('Tyst tal från en begränsad inspelning.')
    expect(f.active).toHaveBeenLastCalledWith(false)
  })
  it('starts a complete new detected question after a long idle without requiring manual review', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.0005, 92000); f.frames(0.02, 200); f.frames(0, 2000)
    await f.resolve('Fråga med en möjligen förlorad början.')
    expect(f.receive).toHaveBeenCalledTimes(1); expect(f.draft).toHaveBeenCalled()
    expect(f.transcribe.mock.calls[0][0].length).toBeLessThan(50000)
    expect(f.active).toHaveBeenLastCalledWith(true)
    f.capture.stop()
  })
  it('releases a real browser-source grant immediately when stopped during worklet loading', async () => {
    let loaded!: () => void
    const track = { stop: vi.fn() }, close = vi.fn(async () => {})
    const addModule = vi.fn(() => new Promise<void>(yes => { loaded = yes }))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } })
    vi.stubGlobal('AudioContext', class { state = 'running'; audioWorklet = { addModule }; close = close })
    const capture = createPcmVoiceCapture({ pauseMs: 2000, receive: vi.fn(), draft: vi.fn(), notice: vi.fn(), interrupt: vi.fn(), active: vi.fn() })
    const start = capture.start(); await Promise.resolve(); await Promise.resolve()
    expect(addModule).toHaveBeenCalledTimes(1)
    capture.stop(); expect(track.stop).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1)
    loaded(); await start
    expect(track.stop).toHaveBeenCalledTimes(1)
  })
  it('deactivates a capped capture when its pending review is discarded and permits restarting', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.02, 92000); f.capture.discard()
    expect(f.active).toHaveBeenLastCalledWith(false)
    await f.resolve('Gammal avbruten fråga.'); expect(f.draft).not.toHaveBeenCalled()
    const next = f.capture.start(); f.grant(); await next
    expect(f.active).toHaveBeenLastCalledWith(true)
    f.frames(0.02, 200); f.capture.finish(); await f.resolve('Ny hel fråga.')
    expect(f.receive.mock.calls).toEqual([['Ny hel fråga.']])
    f.capture.stop()
  })
  it('bounds a stalled worklet load and releases the granted microphone', async () => {
    vi.useFakeTimers()
    const track = { stop: vi.fn() }, active = vi.fn(), notice = vi.fn()
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) } })
    vi.stubGlobal('AudioContext', class { state = 'running'; audioWorklet = { addModule: () => new Promise(() => {}) }; close = async () => {} })
    const capture = createPcmVoiceCapture({ pauseMs: 2000, receive: vi.fn(), draft: vi.fn(), notice, interrupt: vi.fn(), active })
    const start = capture.start(); await Promise.resolve(); await Promise.resolve()
    await vi.advanceTimersByTimeAsync(5000); await start
    expect(track.stop).toHaveBeenCalledTimes(1); expect(active).toHaveBeenLastCalledWith(false)
    expect(notice).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })
})


describe('speaker-mode response preservation', () => {
  it('does not cancel a pending reply when input onset is detected in speaker mode', async () => {
    const f = fixture('speakers'), start = f.capture.start(); f.grant(); await start
    f.frames(0.03, 200)
    expect(f.interrupt).not.toHaveBeenCalled()
    f.capture.stop()
  })
  it('retains spoken interruption in headphone mode', async () => {
    const f = fixture('headphones'), start = f.capture.start(); f.grant(); await start
    f.frames(0.03, 200)
    expect(f.interrupt).toHaveBeenCalledTimes(1)
    f.capture.stop()
  })
})

describe('microphone stream health', () => {
  it('does not claim to listen until a real audio frame arrives', async () => {
    vi.useFakeTimers()
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    expect(f.listening).toHaveBeenLastCalledWith(false)
    f.frames(0, 20)
    expect(f.listening).toHaveBeenLastCalledWith(true)
    f.capture.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('reports a missing stream and releases the microphone after five seconds', async () => {
    vi.useFakeTimers()
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    await vi.advanceTimersByTimeAsync(5000)
    expect(f.stop).toHaveBeenCalledTimes(1)
    expect(f.active).toHaveBeenLastCalledWith(false)
    expect(f.notice).toHaveBeenCalledWith(expect.stringContaining('ljudström'))
    expect(vi.getTimerCount()).toBe(0)
  })
  it('accepts silent frames but detects a stream that later stops', async () => {
    vi.useFakeTimers()
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    for (let i = 0; i < 6; i++) {
      f.frames(0, 20); await vi.advanceTimersByTimeAsync(1000)
    }
    expect(f.notice).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4000)
    expect(f.stop).toHaveBeenCalledTimes(1)
    expect(f.listening).toHaveBeenLastCalledWith(false)
    expect(f.notice).toHaveBeenCalledTimes(1)
  })
})

function streamingFixture(pauseMs = 1200, playbackMode: 'speakers' | 'headphones' = 'speakers') {
  let frame!: (value: Float32Array, probability: number) => void
  const receive = vi.fn(), draft = vi.fn(), notice = vi.fn(), active = vi.fn(), processing = vi.fn(), interrupt = vi.fn(), stop = vi.fn(), transcribe = vi.fn()
  const turns: { send: ReturnType<typeof vi.fn>; finish: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn>; signal: AbortSignal; resolve(text: string): void; reject(error: Error): void }[] = []
  let failSend = false
  const streamTurn = vi.fn((signal: AbortSignal) => {
    let resolve!: (text: string) => void, reject!: (error: Error) => void
    const result = new Promise<string>((yes, no) => { resolve = yes; reject = no })
    void result.catch(() => {})
    const turn = { signal, resolve, reject, send: vi.fn((_bytes: Uint8Array) => { if (failSend) throw new Error('stream_failed') }), finish: vi.fn(() => result), abort: vi.fn() }
    turns.push(turn); return turn
  })
  const capture = createPcmVoiceCapture({ pauseMs, playbackMode, receive, draft, notice, active, processing, interrupt }, {
    open: async callback => { frame = callback; return { sampleRate: 16000, stop } },
    transcribe, streamTurn,
  })
  return { capture, receive, draft, notice, active, processing, interrupt, stop, transcribe, streamTurn, turns,
    failSend: () => { failSend = true },
    restoreSend: () => { failSend = false },
    frames(ms: number, speech = false) { for (let i = 0; i < ms; i += 20) frame(new Float32Array(320).fill(speech ? 0.02 : 0), speech ? 0.95 : 0.01) },
    async resolve(text: string) { turns.at(-1)!.resolve(text); await Promise.resolve(); await Promise.resolve() },
  }
}
describe('optional streaming microphone turns', () => {
  it('opens only after80ms speech and sends the retained first sound exactly once', async () => {
    const f = streamingFixture(); await f.capture.start()
    f.frames(1200); f.frames(60, true); expect(f.streamTurn).not.toHaveBeenCalled()
    f.frames(140, true); expect(f.streamTurn).toHaveBeenCalledTimes(1)
    f.frames(1200)
    const turn = f.turns[0], raw = turn.send.mock.calls.flatMap(([bytes]) => Array.from(new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)))
    expect(raw.filter(x => x > 0)).toHaveLength(3200)
    expect(raw.length).toBe(37120) //1s onset window +120ms remainder +1.2s selected silence
    expect(turn.send.mock.calls.every(([bytes]) => bytes.length <= 6400)).toBe(true)
    expect(turn.finish).toHaveBeenCalledWith('pause'); expect(f.transcribe).not.toHaveBeenCalled()
    await f.resolve('Hela fragan'); expect(f.receive).toHaveBeenCalledTimes(1)
    expect(f.draft.mock.invocationCallOrder[0]).toBeLessThan(f.receive.mock.invocationCallOrder[0])
    f.capture.stop()
  })
  it.each([1200, 1400, 2000, 3500, 5000])('keeps the selected%s ms local pause and counts its streamed silence', async pause => {
    const f = streamingFixture(pause); await f.capture.start(); f.frames(200, true); f.frames(pause - 20)
    expect(f.turns[0].finish).not.toHaveBeenCalled()
    f.frames(20); expect(f.turns[0].finish).toHaveBeenCalledTimes(1)
    await f.resolve('Hej'); expect(f.receive).toHaveBeenCalledWith('Hej'); f.capture.stop()
  })
  it('does not open a paid turn or use batch for manual finish without an onset', async () => {
    const f = streamingFixture(); await f.capture.start(); f.frames(4000); f.capture.finish()
    expect(f.streamTurn).not.toHaveBeenCalled(); expect(f.transcribe).not.toHaveBeenCalled(); expect(f.notice).toHaveBeenCalledTimes(1)
    f.capture.stop()
  })
  it.each(['stop', 'discard', 'output'] as const)('aborts%s and discards a delayed final', async action => {
    const f = streamingFixture(); await f.capture.start(); f.frames(200, true); f.capture.finish()
    const turn = f.turns[0]
    if (action === 'output') f.capture.setOutputActive(true); else f.capture[action]()
    expect(turn.signal.aborted).toBe(true); expect(turn.abort).toHaveBeenCalledTimes(1)
    await f.resolve('late text'); expect(f.receive).not.toHaveBeenCalled(); expect(f.draft).not.toHaveBeenCalled()
    f.capture.stop()
  })
  it('retains the speaker tail gate and opens a fresh headphone interruption', async () => {
    vi.useFakeTimers()
    const f = streamingFixture(); await f.capture.start()
    f.capture.setOutputActive(true); f.frames(4000, true); f.capture.setOutputActive(false)
    await vi.advanceTimersByTimeAsync(399); f.frames(200, true); expect(f.streamTurn).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1); f.frames(200, true); expect(f.streamTurn).toHaveBeenCalledTimes(1); f.capture.stop()
    const h = streamingFixture(1200, 'headphones'); await h.capture.start(); h.frames(200, true)
    expect(h.interrupt).toHaveBeenCalledTimes(1); h.capture.stop()
  })
  it('caps forwarded PCM at90s and keeps the result for manual review only', async () => {
    const f = streamingFixture(); await f.capture.start(); f.frames(92000, true)
    const turn = f.turns[0]
    expect(turn.send.mock.calls.reduce((n, [bytes]) => n + bytes.length, 0)).toBe(2880000)
    expect(turn.finish).toHaveBeenCalledWith('limit'); expect(f.stop).toHaveBeenCalledTimes(1)
    await f.resolve('Lang fraga'); expect(f.draft).toHaveBeenCalledWith('Lang fraga'); expect(f.receive).not.toHaveBeenCalled()
    expect(f.active).toHaveBeenLastCalledWith(false)
  })
  it('keeps the microphone after one transient stream failure, but never replays audio or retries during continuous speech', async () => {
    const f = streamingFixture(); await f.capture.start()
    f.frames(200, true); f.failSend(); f.frames(2000, true)
    expect(f.streamTurn).toHaveBeenCalledTimes(1)
    expect(f.transcribe).not.toHaveBeenCalled()
    expect(f.stop).not.toHaveBeenCalled()
    expect(f.active).toHaveBeenLastCalledWith(true)
    expect(f.turns[0].signal.aborted).toBe(true)
    expect(f.notice).toHaveBeenCalledTimes(1)
    f.restoreSend()
    f.frames(300); f.frames(100)
    expect(f.streamTurn).toHaveBeenCalledTimes(1)
    f.frames(200, true)
    expect(f.streamTurn).toHaveBeenCalledTimes(2)
    f.capture.finish(); await f.resolve('Ny fråga')
    expect(f.receive).toHaveBeenCalledTimes(1); expect(f.receive).toHaveBeenCalledWith('Ny fråga')
    f.capture.stop()
  })
  it('fails closed after two consecutive streaming transport failures without silently rerouting to batch', async () => {
    const f = streamingFixture(); await f.capture.start()
    f.frames(200, true); f.failSend(); f.frames(200, true)
    f.frames(400); f.frames(200, true)
    expect(f.streamTurn).toHaveBeenCalledTimes(2)
    expect(f.stop).toHaveBeenCalledTimes(1)
    expect(f.active).toHaveBeenLastCalledWith(false)
    expect(f.transcribe).not.toHaveBeenCalled()
    expect(f.receive).not.toHaveBeenCalled()
  })
  it('preserves microphone capture when a streamed final fails transiently, then accepts a newly spoken question', async () => {
    const f = streamingFixture(); await f.capture.start()
    f.frames(200, true); f.capture.finish()
    f.turns[0].reject(new Error('temporary_realtime_disconnect'))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(f.stop).not.toHaveBeenCalled()
    expect(f.receive).not.toHaveBeenCalled()
    f.frames(1000, true)
    expect(f.streamTurn).toHaveBeenCalledTimes(1)
    f.frames(400); f.frames(200, true)
    expect(f.streamTurn).toHaveBeenCalledTimes(2)
    f.capture.finish(); await f.resolve('Vi fortsätter')
    expect(f.receive).toHaveBeenCalledTimes(1); expect(f.receive).toHaveBeenCalledWith('Vi fortsätter')
    f.capture.stop()
  })
  it('still closes capture on an authority failure in streaming finalization', async () => {
    const f = streamingFixture(); await f.capture.start()
    f.frames(200, true); f.capture.finish()
    f.turns[0].reject(new Error('voice_access_unavailable'))
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(f.stop).toHaveBeenCalledTimes(1)
    expect(f.active).toHaveBeenLastCalledWith(false)
    expect(f.streamTurn).toHaveBeenCalledTimes(1)
  })
  it('continues checking microphone health during a pending final and fences late text', async () => {
    vi.useFakeTimers()
    const f = streamingFixture(); await f.capture.start(); f.frames(200, true); f.capture.finish()
    for (let i = 0; i < 6; i++) { f.frames(20); await vi.advanceTimersByTimeAsync(1000) }
    expect(f.stop).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(4000); expect(f.stop).toHaveBeenCalledTimes(1)
    await f.resolve('late'); expect(f.receive).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0)
  })
  it('handles three independent start/stop cycles with a single final submission per turn', async () => {
    const f = streamingFixture()
    for (let i = 0; i < 3; i++) {
      await f.capture.start(); f.frames(200, true); f.capture.finish(); f.capture.finish(); await f.resolve('turn' + i); f.capture.stop()
    }
    expect(f.streamTurn).toHaveBeenCalledTimes(3); expect(f.receive.mock.calls).toEqual([['turn0'], ['turn1'], ['turn2']])
    expect(f.turns.every(turn => turn.finish.mock.calls.length === 1 && turn.signal.aborted)).toBe(true)
  })
})
