import { describe, expect, it, vi } from 'vitest'
import { createPcmSpeechPlayer } from '@/lib/atlas/voice-pilot/player'

const sink = () => ({
  prepare: vi.fn(async () => {}),
  push: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
})

describe('Native Nova Sanna playback receipts', () => {
  it('sends only the approved Nova voice and verifies actual PCM output', async () => {
    const speaker = sink()
    const request = vi.fn(async () => new Response(new Uint8Array([0, 64, 0, 64])))
    const player = createPcmSpeechPlayer({ notice: vi.fn() }, { request, sink: speaker })
    expect(await player.playNativeVoice('Hej!')).toBe(true)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][1]).toBe('nova')
    expect(speaker.push).toHaveBeenCalled()
    player.dispose()
  })

  it('does not claim speech succeeded when the provider returns no audio', async () => {
    const player = createPcmSpeechPlayer({ notice: vi.fn() }, {
      request: vi.fn(async () => new Response(new Uint8Array([]))),
      sink: sink(),
    })
    expect(await player.playNativeVoice('Hej!')).toBe(false)
    player.dispose()
  })

  it('fails closed if browser playback permission is blocked before a paid call', async () => {
    const request = vi.fn()
    const player = createPcmSpeechPlayer({ notice: vi.fn() }, {
      request,
      sink: { ...sink(), prepare: vi.fn(async () => { throw new Error('autoplay blocked') }) },
    })
    expect(await player.playNativeVoice('Hej!')).toBe(false)
    expect(request).not.toHaveBeenCalled()
    player.dispose()
  })

  it('aborts and rejects the playback receipt after the operator presses Stop', async () => {
    let response!: (r: Response) => void
    const request = vi.fn((_text: string, _voice: string, _signal: AbortSignal) =>
      new Promise<Response>(resolve => { response = resolve }))
    const player = createPcmSpeechPlayer({ notice: vi.fn() }, { request, sink: sink() })
    const attempt = player.playNativeVoice('Hej!')
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    player.stop()
    response(new Response(new Uint8Array([0, 64])))
    expect(await attempt).toBe(false)
    expect(request.mock.calls[0][2].aborted).toBe(true)
    player.dispose()
  })
})
