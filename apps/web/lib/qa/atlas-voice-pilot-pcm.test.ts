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
  let frame!: (value: Float32Array) => void, grant!: (value: { sampleRate: number; stop(): void }) => void
  let resolve!: (text: string) => void, reject!: (error: Error) => void
  const stop = vi.fn(), receive = vi.fn(), draft = vi.fn(), notice = vi.fn(), interrupt = vi.fn(), active = vi.fn(), listening = vi.fn(), processing = vi.fn(), endpoint = vi.fn()
  const transcribe = vi.fn((_bytes: Uint8Array, _signal: AbortSignal) => new Promise<string>((yes, no) => { resolve = yes; reject = no }))
  const capture = createPcmVoiceCapture({ pauseMs: 2000, playbackMode: mode, receive, draft, notice, interrupt, active, listening, processing, endpoint }, {
    open: callback => { frame = callback; return new Promise(yes => { grant = yes }) }, transcribe, now: () => now,
  })
  return { capture, stop, receive, draft, notice, interrupt, active, listening, processing, transcribe, endpoint, at: (time: number) => { now = time },
    grant: () => grant({ sampleRate: 16000, stop }),
    frames: (amplitude: number, ms: number) => { for (let t = 0; t < ms; t += 20) frame(new Float32Array(320).fill(amplitude)) },
    resolve: async (text: string) => { resolve(text); await Promise.resolve(); await Promise.resolve() },
    reject: async () => { reject(new Error('provider_unavailable')); await Promise.resolve(); await Promise.resolve() },
  }
}

describe('direct audio input without native ASR finalization', () => {
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
    expect(f.transcribe.mock.calls[0][0].length).toBe(96000)
    await f.resolve('En lågmäld men hel fråga.'); expect(f.receive).toHaveBeenCalledWith('En lågmäld men hel fråga.')
    f.capture.stop()
  })
  it('retains a quiet prefix when louder speech finally confirms the utterance', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.0005, 3000); f.frames(0.02, 200); f.frames(0, 2000)
    const samples = new Int16Array(f.transcribe.mock.calls[0][0].buffer)
    expect(Array.from(samples).filter(n => n === Math.round(0.0005 * 32767))).toHaveLength(48000)
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
  it('does not lose the review requirement when speech becomes audible after the idle window overflowed', async () => {
    const f = fixture(), start = f.capture.start(); f.grant(); await start
    f.frames(0.0005, 92000); f.frames(0.02, 200); f.frames(0, 2000)
    await f.resolve('Fråga med en möjligen förlorad början.')
    expect(f.receive).not.toHaveBeenCalled(); expect(f.draft).toHaveBeenCalled()
    expect(f.active).toHaveBeenLastCalledWith(false)
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
