import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({
  sockets: [] as any[], order: [] as string[], governed: vi.fn(), admit: vi.fn(), dispose: vi.fn(), lifetime: null as Promise<unknown> | null,
  ready: true, autoCommit: false, verified: true, unavailable: false,
  rates: { usd_sek: 10, elevenlabs_scribe_v2_realtime_keyterms_usd_per_hour: 0.48 } as Record<string, number>,
  watch: null as AbortController | null,
}))
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events')
  return { default: class Socket extends EventEmitter {
    readyState = 1; bufferedAmount = 0; sent: any[] = []; closes: number[] = []
    constructor(public url: string, public options: any) {
      super(); s.order.push('connect'); s.sockets.push(this)
      if (s.ready) queueMicrotask(() => this.provider({ message_type: 'session_started', config: {
        model_id: 'scribe_v2_realtime', audio_format: 'pcm_16000', sample_rate: 16000, language_code: 'swe',
      } }))
    }
    provider(value: unknown) { this.emit('message', Buffer.from(JSON.stringify(value)), false) }
    send(raw: string, callback?: (error?: Error) => void) {
      const value = JSON.parse(raw); this.sent.push(value); callback?.()
      if (value.commit && s.autoCommit) queueMicrotask(() => this.provider({ message_type: 'committed_transcript', text: 'Hej' }))
    }
    close(code: number) { this.closes.push(code); this.readyState = 3; this.emit('close', code) }
    terminate() { this.readyState = 3; this.emit('close', 1006) }
  } }
})
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => s.rates }))
vi.mock('@/lib/cost/atlas-realtime-billing', () => ({ verifiedAtlasRealtimeRate: (rates: Record<string, number>) => {
  const rate = rates.elevenlabs_scribe_v2_realtime_keyterms_usd_per_hour
  return s.verified && Number.isFinite(rate) && rate >= 0.48 ? rate : null
} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/cost/governed-spend', async orig => ({
  ...await orig<any>(), withGovernedSpend: (...args: any[]) => s.governed(...args),
}))
vi.mock('@/lib/cost/spend-meter', () => ({ currentSpendMeter: () => ({ settleAfter: (p: Promise<unknown>) => { s.lifetime = p; void p.catch(() => {}) } }) }))
vi.mock('@/lib/governance/execution-signal', async orig => ({
  ...await orig<any>(), admitPhysicalRequest: (...args: any[]) => s.admit(...args),
  watchExecutionAuthority: () => ({ signal: s.watch!.signal, abortReason: null, get authorityUnavailable() { return s.unavailable }, dispose: s.dispose }),
}))
const moduleUnderTest = () => import('@/lib/media/elevenlabs-realtime').catch(() => null)
const ctx = { project: { projectId: 'project-test' }, operation: 'test-stream',
  execution: { context: 'OPERATOR_INTERACTIVE' as const, scope: { kind: 'GLOBAL_ONLY' as const } } }
const start = async (signal = new AbortController().signal) => {
  const value = await moduleUnderTest()
  if (!value) throw new Error('adapter_missing')
  return value.openAtlasSwedishRealtime(ctx, signal)
}
const ws = () => s.sockets[0]
const chunk = () => new Uint8Array(6400)
const commit = (text: string) => ws().provider({ message_type: 'committed_transcript', text })
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('ELEVENLABS_API_KEY', 'synthetic-private-key')
  s.sockets = []; s.order = []; s.lifetime = null; s.ready = true; s.autoCommit = false; s.verified = true; s.unavailable = false
  s.rates = { usd_sek: 10, elevenlabs_scribe_v2_realtime_keyterms_usd_per_hour: 0.48 }; s.watch = new AbortController()
  s.governed.mockImplementation(async (_input, run) => { s.order.push('reserve'); return run() })
  s.admit.mockImplementation(async () => { s.order.push('admit') })
})
afterEach(async () => { for (const socket of s.sockets) socket.terminate(); await Promise.resolve(); vi.useRealTimers(); vi.unstubAllEnvs() })
describe('governed realtime transcription adapter', () => {
  it('provides a real adapter', async () => { expect((await moduleUnderTest())?.openAtlasSwedishRealtime).toBeTypeOf('function') })
  it('reserves and admits before exactly one fixed server-owned connection', async () => {
    const turn = await start()
    expect(s.order).toEqual(['reserve', 'admit', 'connect'])
    const input = s.governed.mock.calls[0][0]
    expect(input).toMatchObject({ estimatedSek: 0.16, ceilingBasis: 'fixed_units', provider: 'elevenlabs' })
    const url = new URL(ws().url)
    expect(url.origin).toBe('wss://api.elevenlabs.io'); expect(url.pathname).toBe('/v1/speech-to-text/realtime')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ model_id: 'scribe_v2_realtime', language_code: 'swe', audio_format: 'pcm_16000', commit_strategy: 'manual' })
    expect(url.searchParams.getAll('keyterms')).toHaveLength(6)
    expect(url.searchParams.has('token')).toBe(false)
    expect(ws().options.headers['xi-api-key']).toBe('synthetic-private-key')
    expect(s.lifetime).toBeInstanceOf(Promise); turn.abort()
  })
  it.each(['budget', 'authority', 'missing_key', 'unverified', 'missing_rate', 'low_rate', 'nan_rate', 'aborted'])('makes zero connections for %s', async mode => {
    if (mode === 'budget') s.governed.mockRejectedValue(new Error('budget denied'))
    if (mode === 'authority') s.admit.mockRejectedValue(new Error('authority denied'))
    if (mode === 'missing_key') vi.stubEnv('ELEVENLABS_API_KEY', '')
    if (mode === 'unverified') s.verified = false
    if (mode === 'missing_rate') delete s.rates.elevenlabs_scribe_v2_realtime_keyterms_usd_per_hour
    if (mode === 'low_rate') s.rates.elevenlabs_scribe_v2_realtime_keyterms_usd_per_hour = 0.27
    if (mode === 'nan_rate') s.rates.elevenlabs_scribe_v2_realtime_keyterms_usd_per_hour = NaN
    const controller = new AbortController(); if (mode === 'aborted') controller.abort()
    await expect(start(controller.signal)).rejects.toBeDefined()
    expect(s.sockets).toHaveLength(0)
  })
  it('collects ordered 20s checkpoints and a final tail as one question', async () => {
    const turn = await start()
    for (let i = 0; i < 100; i++) turn.send(chunk())
    expect(ws().sent.filter((v: any) => v.commit)).toHaveLength(1)
    commit('Hej'); for (let i = 0; i < 100; i++) turn.send(chunk())
    commit('varld'); for (let i = 0; i < 7; i++) turn.send(chunk())
    const final = turn.finish('pause')
    expect(turn.finish('pause')).toBe(final)
    commit('igen')
    await expect(final).resolves.toBe('Hej varld igen')
    expect(s.sockets).toHaveLength(1); expect(s.dispose).toHaveBeenCalledTimes(1)
  })
  it('splits an uneven checkpoint boundary without dropping or duplicating audio', async () => {
    const turn = await start(); turn.send(new Uint8Array(100))
    for (let i = 0; i < 99; i++) turn.send(chunk())
    expect(() => turn.send(chunk())).not.toThrow()
    expect(ws().sent.reduce((n: number, v: any) => n + Buffer.from(v.audio_base_64, 'base64').length, 0)).toBe(640000)
    commit('forsta'); const final = turn.finish('pause'); commit('sista')
    await expect(final).resolves.toBe('forsta sista')
    expect(ws().sent.reduce((n: number, v: any) => n + Buffer.from(v.audio_base_64, 'base64').length, 0)).toBe(640100)
  })
  it('finishes a 1.4s question and never invents padding audio', async () => {
    const turn = await start(); for (let i = 0; i < 7; i++) turn.send(chunk())
    const final = turn.finish('manual'); commit('Kort fraga')
    await expect(final).resolves.toBe('Kort fraga')
    expect(ws().sent.reduce((n: number, v: any) => n + Buffer.from(v.audio_base_64, 'base64').length, 0)).toBe(44800)
  })
  it('uses the acknowledged checkpoint for an empty final tail', async () => {
    const turn = await start(); for (let i = 0; i < 100; i++) turn.send(chunk()); commit('klart')
    const sent = ws().sent.length
    await expect(turn.finish('pause')).resolves.toBe('klart')
    expect(ws().sent).toHaveLength(sent)
  })
  it('bounds queued audio during an unacknowledged checkpoint', async () => {
    const turn = await start(); for (let i = 0; i < 110; i++) turn.send(chunk())
    expect(ws().sent).toHaveLength(100)
    expect(() => turn.send(chunk())).toThrow()
    expect(ws().sent).toHaveLength(100); expect(ws().readyState).toBe(3)
  })
  it('rejects the byte that would exceed 90s before provider dispatch', async () => {
    const turn = await start()
    for (let i = 0; i < 450; i++) { turn.send(chunk()); if ((i + 1) % 100 === 0) commit('segment') }
    const sent = ws().sent.length
    expect(() => turn.send(new Uint8Array(2))).toThrow()
    expect(ws().sent).toHaveLength(sent)
    expect(ws().sent.reduce((n: number, v: any) => n + Buffer.from(v.audio_base_64, 'base64').length, 0)).toBe(2880000)
  })
  it.each(['provider_error', 'malformed', 'oversized', 'binary'])('fails closed on %s with no transcript or raw error leakage', async mode => {
    const turn = await start(); turn.send(chunk()); const final = turn.finish('pause')
    if (mode === 'provider_error') ws().provider({ message_type: 'error', error: 'SYNTHETIC_PRIVATE_ERROR' })
    else if (mode === 'malformed') ws().emit('message', Buffer.from('{bad SYNTHETIC_PRIVATE_ERROR'), false)
    else if (mode === 'oversized') ws().emit('message', Buffer.alloc(65537), false)
    else if (mode === 'binary') ws().emit('message', Buffer.alloc(4), true)
    await expect(final).rejects.not.toThrow('SYNTHETIC_PRIVATE_ERROR')
    expect(s.sockets).toHaveLength(1)
  })
  it('rejects an unsolicited committed segment and ignores late events after abort', async () => {
    const turn = await start()
    commit('unsolicited')
    await expect(turn.finish('pause')).rejects.toBeDefined()
    turn.abort(); commit('late')
    expect(ws().sent).toHaveLength(0)
  })
  it('counts transport backpressure before sending an audio block', async () => {
    const turn = await start(); ws().bufferedAmount = 64000
    expect(() => turn.send(chunk())).toThrow()
    expect(ws().sent).toHaveLength(0)
  })
  it('stops further forwarding on unreadable authority without paid retry', async () => {
    const turn = await start(); s.unavailable = true
    expect(() => turn.send(chunk())).toThrow()
    expect(ws().sent).toHaveLength(0); expect(ws().readyState).toBe(3)
  })
  it('stops an idle session when the existing authority watcher latches an unreadable check', async () => {
    vi.useFakeTimers(); await start(); s.unavailable = true
    await vi.advanceTimersByTimeAsync(250)
    expect(ws().readyState).toBe(3); expect(s.dispose).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('rejects a provider that starts with a different audio configuration', async () => {
    s.ready = false; const pending = start(); const rejected = expect(pending).rejects.toBeDefined()
    await vi.waitFor(() => expect(s.sockets).toHaveLength(1))
    ws().provider({ message_type: 'session_started', config: { model_id: 'different', audio_format: 'pcm_16000', sample_rate: 16000, language_code: 'swe' } })
    await rejected; expect(ws().sent).toHaveLength(0)
  })
  it.each(['handshake', 'commit', 'absolute'])('bounds the %s deadline', async mode => {
    vi.useFakeTimers()
    if (mode === 'handshake') {
      s.ready = false; const pending = start(); const rejected = expect(pending).rejects.toBeDefined()
      await vi.advanceTimersByTimeAsync(5250); await rejected
    } else {
      const turn = await start()
      if (mode === 'commit') { turn.send(chunk()); const final = turn.finish('pause'); const rejected = expect(final).rejects.toBeDefined(); await vi.advanceTimersByTimeAsync(20250); await rejected }
      else await vi.advanceTimersByTimeAsync(120250)
    }
    expect(ws().readyState).toBe(3)
  })
})

it('records bounded protocol evidence without audio, text, credentials or provider errors', async () => {
  const log = vi.spyOn(console, 'info').mockImplementation(() => {})
  try {
    const turn = await start(); turn.send(chunk()); const final = turn.finish('manual')
    commit('SYNTHETIC_PRIVATE_TRANSCRIPT')
    await expect(final).resolves.toBe('SYNTHETIC_PRIVATE_TRANSCRIPT')
    const events = log.mock.calls.filter(call => call[0] === '[atlas-voice-realtime]').map(call => call[1])
    expect(events).toEqual([
      expect.objectContaining({ event: 'ready', attemptedPcmBytes: 0, committedSegments: 0 }),
      expect.objectContaining({ event: 'committed', attemptedPcmBytes: 6400, committedSegments: 1 }),
      expect.objectContaining({ event: 'closed', attemptedPcmBytes: 6400, committedSegments: 1, outcome: 'complete' }),
    ])
    expect(JSON.stringify(events)).not.toContain('SYNTHETIC_PRIVATE')
    expect(JSON.stringify(events)).not.toContain('synthetic-private-key')
    expect(JSON.stringify(events)).not.toContain('audio_base_64')
  } finally { log.mockRestore() }
})
