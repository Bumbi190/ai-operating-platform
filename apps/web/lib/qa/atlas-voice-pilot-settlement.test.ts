import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const s = vi.hoisted(() => ({
  reserve: vi.fn(), settle: vi.fn(), release: vi.fn(), mark: vi.fn(), waitUntil: vi.fn(), dispose: vi.fn(),
}))
vi.mock('@vercel/functions', () => ({ waitUntil: (work: Promise<unknown>) => s.waitUntil(work) }))
vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: (...args: unknown[]) => s.reserve(...args), settleSpend: (...args: unknown[]) => s.settle(...args),
  releaseSpend: (...args: unknown[]) => s.release(...args), markSpendDispatchIntent: (...args: unknown[]) => s.mark(...args),
  openOverrideReservation: async () => null,
}))
vi.mock('@/lib/cost/advisory-override', () => ({ recordAdvisoryOverride: async () => {} }))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10, elevenlabs_usd_per_1k_chars: 0.24 }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/governance/execution-stop', async orig => ({
  ...await orig<any>(), resolveExecutionStopForContract: async () => ({ allowed: true, resolution: 'RESOLVED' }),
}))
vi.mock('@/lib/governance/execution-signal', async orig => ({
  ...await orig<any>(), admitPhysicalRequest: async () => {},
  watchExecutionAuthority: () => ({ signal: new AbortController().signal, abortReason: null, dispose: s.dispose }),
}))
import { streamAtlasSwedishVoice } from '@/lib/media/elevenlabs'
const ctx = { project: { projectId: 'project-test' }, operation: 'voice-test',
  execution: { context: 'OPERATOR_INTERACTIVE' as const, scope: { kind: 'GLOBAL_ONLY' as const } } }
const settled = { settled: true, result: 'settled', settledSek: 0.03, ceilingExceeded: false }
let body: ReadableStreamDefaultController<Uint8Array>
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ELEVENLABS_API_KEY', 'test-only')
  s.reserve.mockResolvedValue({ allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok', reservationId: 'res-test' })
  s.mark.mockResolvedValue(true); s.settle.mockResolvedValue(settled)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/v2/voices?')
    ? Response.json({ voices: [{ voice_id: 'DSL3PSQNPbkOavwmnYl1' }] })
    : new Response(new ReadableStream<Uint8Array>({ start(c) { body = c; c.enqueue(new Uint8Array([0, 64])) } }))))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
const start = (signal = new AbortController().signal) => streamAtlasSwedishVoice(ctx, 'Hej André', 'DSL3PSQNPbkOavwmnYl1', signal)
describe('Atlas PCM uses the real governed streaming settlement', () => {
  it('returns playable bytes while settlement is stalled, with a durable full-ceiling reservation', async () => {
    let finish!: (value: typeof settled) => void
    s.settle.mockReturnValue(new Promise(resolve => { finish = resolve }))
    const pending = start()
    let response: Response | undefined
    void pending.then(value => { response = value })
    // Old adapter blocks here on settleSpend; the provider already has audio.
    try {
      await vi.waitFor(() => expect(response).toBeDefined(), { timeout: 250 })
      expect(s.waitUntil).toHaveBeenCalledTimes(1)
      expect(s.settle).not.toHaveBeenCalled()
      const reader = response!.body!.getReader()
      expect(Array.from((await reader.read()).value!)).toEqual([0, 64])
      body.close(); await reader.read()
      await vi.waitFor(() => expect(s.settle).toHaveBeenCalledTimes(1))
      expect(s.settle.mock.calls[0][1]).toMatchObject({ kind: 'estimate_unmetered', rows: [] })
      expect(s.release).not.toHaveBeenCalled()
      let durableDone = false
      void s.waitUntil.mock.calls[0][0].then(() => { durableDone = true })
      await Promise.resolve(); expect(durableDone).toBe(false)
      finish(settled); await s.waitUntil.mock.calls[0][0]
      expect(s.dispose).toHaveBeenCalledTimes(1)
    } finally { finish?.(settled); await pending; try { body.close() } catch {} }
  })
  it.each(['cancel', 'abort', 'upstream'] as const)('retains the full ceiling on %s after headers, with no paid retry', async mode => {
    const abort = new AbortController(), response = await start(abort.signal)
    expect(s.waitUntil).toHaveBeenCalledTimes(1)
    if (mode === 'cancel') await response.body!.cancel()
    else {
      if (mode === 'abort') abort.abort()
      else body.error(new Error('provider disappeared'))
      await expect(response.arrayBuffer()).rejects.toBeDefined()
    }
    await s.waitUntil.mock.calls[0][0]
    expect(s.settle.mock.calls[0][1]).toMatchObject({ kind: 'estimate_ambiguous', rows: [] })
    expect(s.release).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(2) // one unbilled lookup, one synthesis
    expect(s.dispose).toHaveBeenCalledTimes(1)
  })
  it('keeps the reservation held if deferred settlement fails', async () => {
    s.settle.mockResolvedValue({ ...settled, settled: false, result: 'failed' })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await start(); body.close(); await response.arrayBuffer()
      expect(s.waitUntil).toHaveBeenCalledTimes(1)
      await s.waitUntil.mock.calls[0][0]
      expect(s.release).not.toHaveBeenCalled()
      expect(log.mock.calls.flat().join(' ')).toContain('stays held')
    } finally { log.mockRestore() }
  })
})
