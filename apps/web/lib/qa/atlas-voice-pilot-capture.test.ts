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
})

function captureFixture() {
  let grant!: (stream: MediaStream) => void
  let level!: (rms: number, now: number) => void
  const track = { stop: vi.fn() }, stream = { getTracks: () => [track] } as unknown as MediaStream
  const recognizers: any[] = []
  const receive = vi.fn(), interrupt = vi.fn(), draft = vi.fn(), notice = vi.fn(), active = vi.fn(), stopMonitor = vi.fn()
  const capture = createPilotVoiceCapture({ pauseMs: 2000, receive, interrupt, draft, notice, active }, {
    getMedia: () => new Promise<MediaStream>(resolve => { grant = resolve }),
    recognition: () => { const rec = { start: vi.fn(), abort: vi.fn() }; recognizers.push(rec); return rec as any },
    monitor: async (_stream, callback) => { level = callback; return stopMonitor },
  })
  return { capture, grant: () => grant(stream), level: (rms: number, now: number) => level(rms, now), track, recognizers, receive, interrupt, draft, notice, active, stopMonitor }
}
const finals = (...texts: string[]) => ({ results: texts.map(text => Object.assign([{ transcript: text }], { isFinal: true })) })

describe('continuous microphone lifecycle', () => {
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
