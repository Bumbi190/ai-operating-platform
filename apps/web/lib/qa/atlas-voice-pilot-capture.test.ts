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
  let now = 0
  let grant!: (stream: MediaStream) => void
  let level!: (rms: number, now: number) => void
  const track = { stop: vi.fn() }, stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream
  const recognizers: any[] = []
  const receive = vi.fn(), interrupt = vi.fn(), draft = vi.fn(), notice = vi.fn(), active = vi.fn(), listening = vi.fn(), stopMonitor = vi.fn()
  const capture = createPilotVoiceCapture({ pauseMs: 2000, playbackMode, receive, interrupt, draft, notice, active, listening }, {
    getMedia: () => new Promise<MediaStream>(resolve => { grant = resolve }),
    recognition: () => { const rec = { start: vi.fn(), stop: vi.fn(), abort: vi.fn() }; recognizers.push(rec); return rec as any },
    monitor: async (_stream, callback) => { level = callback; return stopMonitor },
    now: () => now,
  })
  return { capture, grant: () => grant(stream), at: (value: number) => { now = value }, level: (rms: number, time: number) => { now = time; level(rms, time) }, track, recognizers, receive, interrupt, draft, notice, active, listening, stopMonitor }
}
const finals = (...texts: string[]) => ({ results: texts.map(text => Object.assign([{ transcript: text }], { isFinal: true })) })

describe('continuous microphone lifecycle', () => {
  it('keeps quiet native speech active across final segments until a real endpoint', async () => {
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0]
    rec.onspeechstart(); f.at(100); rec.onresult(finals('Jag vill'))
    f.level(0.002, 4000)
    expect(f.receive).not.toHaveBeenCalled(); expect(rec.stop).not.toHaveBeenCalled()
    f.at(4100); rec.onresult(finals('Jag vill', 'fortsätta hela tanken.'))
    f.at(4200); rec.onspeechend(); f.level(0, 6199)
    expect(f.receive).not.toHaveBeenCalled()
    f.level(0, 6200)
    expect(f.receive.mock.calls).toEqual([['Jag vill fortsätta hela tanken.']])
    f.capture.stop()
  })
  it('renews a final-only fallback pause when more recognized words arrive', async () => {
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0]
    f.at(100); rec.onresult(finals('Jag tänker'))
    f.level(0, 1900); f.at(2000); rec.onresult(finals('Jag tänker', 'på nästa steg.'))
    f.level(0, 2100); expect(f.receive).not.toHaveBeenCalled()
    f.level(0, 3999); expect(f.receive).not.toHaveBeenCalled()
    f.level(0, 4000)
    expect(f.receive.mock.calls).toEqual([['Jag tänker på nästa steg.']])
    f.capture.stop()
  })
  it.each([false, true])('rejects buffered native finals after manual discard, vanished interim=%s', async vanishedInterim => {
    vi.useFakeTimers()
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0], lateResult = rec.onresult
    if (vanishedInterim) {
      rec.onresult({ results: [Object.assign([{ transcript: 'gammalt tal' }], { isFinal: false })] })
      rec.onresult({ results: [] })
    }
    f.capture.discard(); lateResult(finals('gammalt tal'))
    f.level(0, 3000)
    expect(f.receive).not.toHaveBeenCalled()
    expect(rec.abort).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(250)
    expect(f.recognizers).toHaveLength(2)
    f.at(3100); f.recognizers[1].onresult(finals('Ny fråga.')); f.level(0, 5100)
    expect(f.receive.mock.calls).toEqual([['Ny fråga.']])
    f.capture.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('accepts a native final answer without RMS or native speech-detection events', async () => {
    const f = captureFixture('speakers'), start = f.capture.start(); f.grant(); await start
    f.at(100); f.recognizers[0].onresult(finals('Ja, gör planen.'))
    f.level(0.002, 2099); expect(f.receive).not.toHaveBeenCalled()
    f.level(0, 2100); expect(f.receive).toHaveBeenCalledWith('Ja, gör planen.')
    f.capture.stop()
  })
  it('uses a proven acoustic pause when native speechend is missing and drains all final deltas before sending', async () => {
    vi.useFakeTimers()
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0]
    rec.onspeechstart()
    rec.onresult({ results: [Object.assign([{ transcript: 'Hallå Atlas kan du kolla på planen' }], { isFinal: false })] })
    f.level(0.1, 0); f.level(0.1, 200); f.level(0, 2200)
    expect(rec.stop).toHaveBeenCalledTimes(1)
    rec.onresult(finals('Hallå Atlas'))
    f.level(0, 2250); expect(f.receive).not.toHaveBeenCalled()
    rec.onresult(finals('Hallå Atlas', 'kan du kolla på planen?'))
    f.at(2300); rec.onend(); f.level(0, 2300)
    expect(f.receive.mock.calls).toEqual([['Hallå Atlas kan du kolla på planen?']])
    f.capture.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('never treats a watchdog as proof that a final recognition snapshot is complete', async () => {
    vi.useFakeTimers()
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0]
    rec.onresult({ results: [Object.assign([{ transcript: 'hela frågan saknas' }], { isFinal: false })] })
    f.level(0.1, 0); f.level(0.1, 200); f.level(0, 2200)
    rec.onresult(finals('hela'))
    f.level(0, 2250); vi.advanceTimersByTime(4000); f.level(0, 6500)
    expect(f.receive).not.toHaveBeenCalled()
    expect(f.notice).toHaveBeenCalledTimes(1)
    expect(f.track.stop).toHaveBeenCalledTimes(1)
  })
  it('discard cancels a drain even if native results have become final before native end', async () => {
    vi.useFakeTimers()
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0]
    rec.onresult({ results: [Object.assign([{ transcript: 'utkast' }], { isFinal: false })] })
    f.level(0.1, 0); f.level(0.1, 200); f.level(0, 2200)
    rec.onresult(finals('utkast'))
    const lateEnd = rec.onend
    f.capture.discard(); vi.advanceTimersByTime(4000); lateEnd(); f.level(0, 6500)
    expect(f.receive).not.toHaveBeenCalled(); expect(f.notice).not.toHaveBeenCalled()
    expect(f.recognizers).toHaveLength(2); expect(f.track.stop).not.toHaveBeenCalled()
    f.capture.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('preserves the pending words for review when native recognition removes an interim slot during drain', async () => {
    vi.useFakeTimers()
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0]
    rec.onresult({ results: [Object.assign([{ transcript: 'Kan du kolla hela min plan' }], { isFinal: false })] })
    f.level(0.1, 0); f.level(0.1, 200); f.level(0, 2200)
    rec.onresult({ results: [] }); rec.onend(); f.level(0, 2250)
    expect(f.receive).not.toHaveBeenCalled()
    expect(f.draft).toHaveBeenLastCalledWith('Kan du kolla hela min plan')
    expect(f.notice).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('accepts a quiet short answer confirmed by native speech events even below the RMS threshold', async () => {
    const f = captureFixture('speakers'), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0]
    rec.onspeechstart(); f.level(0.002, 50)
    f.at(100); rec.onspeechend(); rec.onresult(finals('Ja.'))
    f.level(0, 2099); expect(f.receive).not.toHaveBeenCalled()
    f.level(0, 2100); expect(f.receive).toHaveBeenCalledWith('Ja.')
    f.capture.stop()
  })
  it('keeps listening through long quiet speech and asks native recognition to finalize interim text after the pause', async () => {
    vi.useFakeTimers()
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0]
    rec.onspeechstart()
    rec.onresult({ results: [Object.assign([{ transcript: 'Hallå Atlas kan du kolla' }], { isFinal: false })] })
    f.level(0.002, 8000)
    expect(rec.stop).not.toHaveBeenCalled(); expect(f.receive).not.toHaveBeenCalled()
    f.at(8500); rec.onspeechend(); f.level(0, 10499)
    expect(rec.stop).not.toHaveBeenCalled()
    f.level(0, 10500); f.level(0, 10600)
    expect(rec.stop).toHaveBeenCalledTimes(1); expect(rec.abort).not.toHaveBeenCalled()
    rec.onresult(finals('Hallå Atlas kan du kolla på planen?')); rec.onend(); f.level(0, 10650)
    expect(f.receive.mock.calls).toEqual([['Hallå Atlas kan du kolla på planen?']])
    vi.advanceTimersByTime(250); expect(f.recognizers).toHaveLength(2)
    expect(f.track.stop).not.toHaveBeenCalled(); f.capture.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('finalizes a pending transcript from the acoustic pause even when native speech events are unavailable', async () => {
    vi.useFakeTimers()
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    const rec = f.recognizers[0]
    rec.onresult({ results: [Object.assign([{ transcript: 'En hel fråga' }], { isFinal: false })] })
    f.level(0.1, 0); f.level(0.1, 200); f.level(0, 2200)
    expect(rec.stop).toHaveBeenCalledTimes(1)
    rec.onresult(finals('En hel fråga.')); rec.onend(); f.level(0, 2250)
    expect(f.receive).toHaveBeenCalledWith('En hel fråga.')
    f.capture.stop(); expect(vi.getTimerCount()).toBe(0)
  })
  it('bounds a missing final transcript without silently sending the partial question', async () => {
    vi.useFakeTimers()
    const f = captureFixture(), start = f.capture.start(); f.grant(); await start
    f.recognizers[0].onresult({ results: [Object.assign([{ transcript: 'Frågan är inte klar' }], { isFinal: false })] })
    f.level(0.1, 0); f.level(0.1, 200); f.level(0, 2200)
    vi.advanceTimersByTime(4000)
    expect(f.receive).not.toHaveBeenCalled()
    expect(f.notice).toHaveBeenCalledTimes(1)
    expect(f.draft).toHaveBeenLastCalledWith('Frågan är inte klar')
    expect(f.track.stop).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0)
  })
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
    f.recognizers[1].onresult({ results: [Object.assign([{ transcript: 'Min egen fråga.' }], { isFinal: false })] })
    f.level(0, 5400)
    expect(f.receive).not.toHaveBeenCalled()
    f.level(0.1, 6000); f.level(0.1, 6200); f.recognizers[1].onresult(finals('Min egen fråga.')); f.level(0, 8200)
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
