import { describe, expect, it, vi, afterEach } from 'vitest'
import { createAcousticTurnGate } from '@/lib/atlas/voice-pilot/turn-gate'
import { createPilotVoiceCapture } from '@/lib/atlas/voice-pilot/capture'

afterEach(() => vi.useRealTimers())

describe('acoustic thinking pause', () => {
  it('does not submit during sustained speech, even without transcription changes', () => {
    const receive = vi.fn(), interrupt = vi.fn()
    const gate = createAcousticTurnGate({ pauseMs: 2000, receive, interrupt })
    gate.text('Jag funderar på en sak')
    for (let t = 0; t <= 6000; t += 50) gate.sample(0.08, t)
    expect(receive).not.toHaveBeenCalled()
    expect(interrupt).toHaveBeenCalledTimes(1)
    gate.sample(0, 7950)
    expect(receive).not.toHaveBeenCalled()
    gate.sample(0, 8000)
    expect(receive).toHaveBeenCalledWith('Jag funderar på en sak')
    gate.sample(0, 12000)
    expect(receive).toHaveBeenCalledTimes(1)
  })
  it('resets the pause when the user continues and accepts delayed final text', () => {
    const receive = vi.fn()
    const gate = createAcousticTurnGate({ pauseMs: 2000, receive, interrupt: vi.fn() })
    gate.sample(0.1, 0); gate.sample(0.1, 200); gate.sample(0, 1000)
    gate.sample(0.1, 1700); gate.sample(0.1, 1900); gate.sample(0, 3000)
    gate.sample(0, 3900)
    expect(receive).not.toHaveBeenCalled()
    gate.text('hela tanken')
    gate.sample(0, 3950)
    expect(receive).toHaveBeenCalledWith('hela tanken')
  })
  it('ignores isolated clicks, invalid levels and words without microphone activity', () => {
    const receive = vi.fn(), interrupt = vi.fn()
    const gate = createAcousticTurnGate({ pauseMs: 2000, receive, interrupt })
    gate.text('text')
    gate.sample(0.8, 0); gate.sample(0, 50); gate.sample(NaN, 3000)
    gate.sample(0, 5000)
    expect(receive).not.toHaveBeenCalled(); expect(interrupt).not.toHaveBeenCalled()
  })
  it('discard clears text and activity so old speech cannot become a new turn', () => {
    const receive = vi.fn()
    const gate = createAcousticTurnGate({ pauseMs: 2000, receive, interrupt: vi.fn() })
    gate.text('gammalt'); gate.sample(0.1, 0); gate.sample(0.1, 200)
    gate.discard(); gate.sample(0, 5000)
    expect(receive).not.toHaveBeenCalled()
  })
  it('reports actual acoustic wait including a late final transcript, rather than assuming the configured pause', () => {
    const endpoint = vi.fn(), receive = vi.fn()
    const gate = createAcousticTurnGate({ pauseMs: 1200, receive, interrupt: vi.fn(), endpoint })
    gate.sample(0.1, 0); gate.sample(0.1, 200); gate.sample(0, 2000)
    expect(endpoint).not.toHaveBeenCalled()
    gate.text('Nu kom sista orden.'); gate.sample(0, 4200); gate.sample(0, 5000)
    expect(endpoint.mock.calls).toEqual([[4000]])
    expect(receive).toHaveBeenCalledTimes(1)
  })
})

function captureFixture(playbackMode?: 'speakers' | 'headphones') {
  let grant!: (stream: MediaStream) => void
  let level!: (rms: number, now: number) => void
  const track = { stop: vi.fn() }, stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream
  const recognizers: any[] = []
  const receive = vi.fn(), interrupt = vi.fn(), draft = vi.fn(), notice = vi.fn(), active = vi.fn(), listening = vi.fn(), stopMonitor = vi.fn()
  const capture = createPilotVoiceCapture({ pauseMs: 2000, playbackMode, receive, interrupt, draft, notice, active, listening }, {
    getMedia: () => new Promise<MediaStream>(resolve => { grant = resolve }),
    recognition: () => { const rec = { start: vi.fn(), abort: vi.fn() }; recognizers.push(rec); return rec as any },
    monitor: async (_stream, callback) => { level = callback; return stopMonitor },
  })
  return { capture, grant: () => grant(stream), level: (rms: number, now: number) => level(rms, now), track, recognizers, receive, interrupt, draft, notice, active, listening, stopMonitor }
}
const finals = (...texts: string[]) => ({ results: texts.map(text => Object.assign([{ transcript: text }], { isFinal: true })) })

describe('continuous microphone lifecycle', () => {
  it('signals ready only after the current recognizer starts, never during speaker recovery or from a stale callback', async () => {
    vi.useFakeTimers()
    const f = captureFixture('speakers'), start = f.capture.start(); f.grant(); await start
    expect(f.listening).not.toHaveBeenCalledWith(true)
    const lateStart = f.recognizers[0].onstart
    lateStart(); expect(f.listening).toHaveBeenLastCalledWith(true)
    f.capture.setOutputActive(true); expect(f.listening).toHaveBeenLastCalledWith(false)
    lateStart(); expect(f.listening).toHaveBeenLastCalledWith(false)
    f.capture.setOutputActive(false); vi.advanceTimersByTime(400)
    expect(f.listening).toHaveBeenLastCalledWith(false)
    f.recognizers[1].onstart(); expect(f.listening).toHaveBeenLastCalledWith(true)
    f.capture.stop(); expect(f.listening).toHaveBeenLastCalledWith(false)
  })
  it('feeds recognition the same microphone track that requested echo cancellation', async () => {
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    expect(f.recognizers[0].start).toHaveBeenCalledWith(f.track)
    f.capture.stop()
  })
  it('blocks speaker echo and late recognition results until playback and its tail finish', async () => {
    vi.useFakeTimers()
    const f = captureFixture('speakers'), start = f.capture.start(); f.grant(); await start
    const late = f.recognizers[0].onresult
    f.capture.setOutputActive(true)
    late(finals('Atlas talade själv.'))
    f.level(0.1, 0); f.level(0.1, 200); f.level(0, 2200)
    expect(f.recognizers[0].abort).toHaveBeenCalledTimes(1)
    expect(f.interrupt).not.toHaveBeenCalled(); expect(f.receive).not.toHaveBeenCalled(); expect(f.draft).not.toHaveBeenCalled()
    f.capture.setOutputActive(false); vi.advanceTimersByTime(399)
    expect(f.recognizers).toHaveLength(1)
    f.level(0.1, 3000); f.level(0.1, 3200)
    vi.advanceTimersByTime(1)
    expect(f.recognizers).toHaveLength(2)
    f.recognizers[1].onresult(finals('Min egen fråga.'))
    f.level(0, 5400)
    expect(f.receive).not.toHaveBeenCalled()
    f.level(0.1, 6000); f.level(0.1, 6200); f.level(0, 8200)
    expect(f.receive.mock.calls).toEqual([['Min egen fråga.']])
    f.capture.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('cancels speaker-tail restarts on stop and keeps headphone voice interruption available', async () => {
    vi.useFakeTimers()
    const f = captureFixture('speakers'), start = f.capture.start(); f.grant(); await start
    f.capture.setOutputActive(true); f.capture.setOutputActive(false); f.capture.stop()
    vi.advanceTimersByTime(1000); expect(f.recognizers).toHaveLength(1)
    const h = captureFixture('headphones'), next = h.capture.start(); h.grant(); await next
    h.capture.setOutputActive(true)
    h.recognizers[0].onresult(finals('Avbryt.'))
    h.level(0.1, 0); h.level(0.1, 200); h.level(0, 2200)
    expect(h.interrupt).toHaveBeenCalledTimes(1); expect(h.receive).toHaveBeenCalledWith('Avbryt.')
    h.capture.stop()
  })
  it('starts muted during existing speaker playback and cancels recovery when another chunk arrives', async () => {
    vi.useFakeTimers()
    const f = captureFixture('speakers')
    f.capture.setOutputActive(true)
    const start = f.capture.start(); f.grant(); await start
    expect(f.recognizers).toHaveLength(0)
    f.capture.setOutputActive(false); vi.advanceTimersByTime(200)
    f.capture.setOutputActive(true); vi.advanceTimersByTime(1000)
    expect(f.recognizers).toHaveLength(0)
    f.capture.setOutputActive(false); vi.advanceTimersByTime(400)
    expect(f.recognizers).toHaveLength(1)
    f.capture.stop()
  })
  it('releases late microphone permission and never starts recognition after stop', async () => {
    const f = captureFixture(), start = f.capture.start()
    f.capture.stop(); f.grant(); await start
    expect(f.track.stop).toHaveBeenCalledTimes(1)
    expect(f.recognizers).toHaveLength(0)
    expect(f.active).not.toHaveBeenCalledWith(true)
  })
  it('keeps recognition running across utterances, with no replay of previous final results', async () => {
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0]
    rec.onresult(finals('Först.'))
    f.level(0.1, 0); f.level(0.1, 200); f.level(0, 2200)
    expect(f.receive).toHaveBeenLastCalledWith('Först.')
    expect(rec.abort).not.toHaveBeenCalled()
    rec.onresult(finals('Först.', 'Sedan.'))
    f.level(0.1, 3000); f.level(0.1, 3200); f.level(0, 5200)
    expect(f.receive.mock.calls).toEqual([['Först.'], ['Sedan.']])
    f.capture.stop(); expect(f.stopMonitor).toHaveBeenCalledTimes(1); expect(f.track.stop).toHaveBeenCalledTimes(1)
  })
  it('preserves the unfinished thought through a native recognition restart', async () => {
    vi.useFakeTimers(); const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    f.recognizers[0].onresult(finals('Jag tänker'))
    f.level(0.1, 0); f.level(0.1, 200)
    f.recognizers[0].onend(); vi.advanceTimersByTime(250)
    f.recognizers[1].onresult(finals('på svenska.'))
    f.level(0, 2200)
    expect(f.receive).toHaveBeenCalledWith('Jag tänker på svenska.')
    f.capture.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('ignores late results after stop and surfaces permission/recognition errors', async () => {
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const late = f.recognizers[0].onresult
    f.recognizers[0].onerror({ error: 'not-allowed' }); late(finals('Ska inte skickas'))
    expect(f.notice).toHaveBeenCalledTimes(1); expect(f.draft).not.toHaveBeenCalled()
    expect(f.track.stop).toHaveBeenCalledTimes(1)
  })
  it('waits for the final ASR hypothesis and does not replay a manually consumed interim result', async () => {
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const interim = { results: [Object.assign([{ transcript: 'en halv tanke' }], { isFinal: false })] }
    f.recognizers[0].onresult(interim)
    const lateResult = f.recognizers[0].onresult
    f.level(0.1, 0); f.level(0.1, 200); f.level(0, 2200)
    expect(f.receive).not.toHaveBeenCalled()
    f.capture.discard()
    lateResult(finals('en halv tanke'))
    f.level(0.1, 3000); f.level(0.1, 3200); f.level(0, 5200)
    expect(f.receive).not.toHaveBeenCalled()
    f.capture.stop()
  })
  it('accepts a new utterance after discarded interim slots are removed by native recognition', async () => {
    vi.useFakeTimers(); const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    f.recognizers[0].onresult({ results: [Object.assign([{ transcript: 'utkast' }], { isFinal: false })] })
    f.capture.discard(); vi.advanceTimersByTime(250)
    const current = f.recognizers.at(-1)!
    current.onresult({ results: [] })
    current.onresult(finals('Ny fråga.'))
    f.level(0.1, 0); f.level(0.1, 200); f.level(0, 2200)
    expect(f.receive).toHaveBeenCalledWith('Ny fråga.')
    f.capture.stop()
  })
})
