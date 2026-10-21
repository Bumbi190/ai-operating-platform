import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ auth: { ok: true, reason: '' }, calls: [] as any[], refused: false, lookup: true, mode: 'ok', dispose: vi.fn(), body: null as ReadableStreamDefaultController<Uint8Array> | null }))
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: async () => state.auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner', revoked_at: null }, error: null }) }) }) }),
}) }))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10.5, elevenlabs_usd_per_1k_chars: 0.24 }) }))
vi.mock('@/lib/cost/governed-spend', async orig => ({ ...(await orig<any>()),
  withGovernedSpend: async (input: unknown, run: () => Promise<Response>) => { state.calls.push(input); if (state.refused) throw new Error('budget'); return run() },
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/governance/execution-signal', async orig => ({ ...(await orig<any>()),
  admitPhysicalRequest: async () => { state.calls.push('admit') },
  watchExecutionAuthority: () => ({ signal: new AbortController().signal, abortReason: null, dispose: state.dispose }),
}))
import { GET, POST } from '@/app/api/atlas/voice-pilot/speech/route'
const post = (body: unknown = { text: 'Hej André', voice: 'anders' }, origin = 'https://preview.test') => new Request('https://preview.test/api/atlas/voice-pilot/speech', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
})
let fetcher: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('ELEVENLABS_API_KEY', 'secret-test-key')
  state.auth = { ok: true, reason: '' }; state.calls = []; state.refused = false; state.lookup = true; state.mode = 'ok'; state.dispose.mockClear()
  fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/v2/voices?')) return Response.json({ voices: state.lookup ? [{ voice_id: 'DSL3PSQNPbkOavwmnYl1' }] : [] })
    state.calls.push('dispatch')
    if (state.mode === 'reset') throw new Error('socket lost')
    if (state.mode === 'rejected') return new Response('secret-provider-detail', { status: 401 })
    if (state.mode === 'hanging') return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      state.body = controller; controller.enqueue(new Uint8Array([0, 64]))
      init?.signal?.addEventListener('abort', () => { try { controller.error(new Error('aborted upstream')) } catch {} })
    } }))
    return new Response(new Uint8Array([0, 64, 0, 128]))
  })
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
describe('isolated Swedish speech route', () => {
  it('refuses production and non-operators before lookup, parsing or spend', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect((await POST(post())).status).toBe(404)
    vi.stubEnv('VERCEL_ENV', 'preview'); state.auth = { ok: false, reason: 'not_platform_operator' }
    expect((await GET(post())).status).toBe(403)
    expect((await POST(post())).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled(); expect(state.calls).toEqual([])
  })
  it('rejects forged origins, unsupported voices, long/non-string/malformed bodies without dispatch', async () => {
    expect((await POST(post(undefined, 'https://evil.test'))).status).toBe(403)
    for (const body of [{ text: 'Hej', voice: 'victoria' }, { text: 'a'.repeat(601), voice: 'anders' }, { text: [], voice: 'anders' }, null, { text: 'a'.repeat(9000), voice: 'anders' }]) {
      expect((await POST(post(body))).status).toBeGreaterThanOrEqual(400)
    }
    expect(fetcher).not.toHaveBeenCalled(); expect(state.calls).toEqual([])
  })
  it('excludes custom-price voices and refuses unavailable voices without paid dispatch', async () => {
    state.lookup = false
    expect((await POST(post())).status).toBe(503)
    expect(fetcher.mock.calls[0][0]).toContain('include_custom_rates=false')
    expect(state.calls).toEqual([])
  })
  it('reserves the full character ceiling before physical admission and streams raw PCM', async () => {
    const response = await POST(post())
    expect(response.status).toBe(200)
    expect(state.calls).toEqual([expect.objectContaining({ provider: 'elevenlabs', ceilingBasis: 'fixed_units',
      execution: { context: 'OPERATOR_INTERACTIVE', scope: { kind: 'GLOBAL_ONLY' } } }), 'admit', 'dispatch'])
    // Ledger quantization belongs exclusively to the real withGovernedSpend.
    expect(state.calls[0].estimatedSek).toBeCloseTo(9 / 1000 * 0.24 * 10.5, 12)
    const payload = JSON.parse(fetcher.mock.calls[1][1].body)
    expect(payload).toMatchObject({ text: 'Hej André', model_id: 'eleven_flash_v2_5', language_code: 'sv' })
    expect(response.headers.get('content-type')).toBe('audio/pcm')
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([0, 64, 0, 128])
    expect(state.dispose).toHaveBeenCalledTimes(1)
  })
  it('keeps budget refusal before paid dispatch and returns only a safe error', async () => {
    state.refused = true
    const response = await POST(post())
    expect(response.status).toBe(503); expect(state.calls).not.toContain('dispatch')
    state.refused = false; state.mode = 'rejected'
    expect(await (await POST(post())).text()).not.toContain('secret-provider-detail')
    expect(state.dispose).toHaveBeenCalledTimes(1)
  })
  it('does not retry ambiguous transport failure', async () => {
    state.mode = 'reset'
    expect((await POST(post())).status).toBe(503)
    expect(state.calls.filter(c => c === 'dispatch')).toHaveLength(1)
    expect(state.dispose).toHaveBeenCalledTimes(1)
  })
  it('releases authority after caller abort even when downstream never reads the prefetched chunk', async () => {
    state.mode = 'hanging'
    const abort = new AbortController()
    const response = await POST(new Request(post(), { signal: abort.signal }))
    expect(response.ok).toBe(true)
    abort.abort()
    await vi.waitFor(() => expect(state.dispose).toHaveBeenCalledTimes(1))
  })
  it('observes upstream failure without waiting for another downstream pull', async () => {
    state.mode = 'hanging'
    const response = await POST(post())
    expect(response.ok).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 0))
    state.body!.error(new Error('body lost'))
    await vi.waitFor(() => expect(state.dispose).toHaveBeenCalledTimes(1))
  })
})

it('reports speech preparation duration without logging speech text or provider secrets', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  try {
    const phrase = 'Privat fras för tidsmätningen.'
    const response = await POST(post({ text: phrase, voice: 'anders' }))
    await response.arrayBuffer()
    expect(response.headers.get('server-timing')).toMatch(/^atlas_speech_headers;dur=\d+$/)
    expect(info).toHaveBeenCalledWith('[atlas-voice-trial]', expect.objectContaining({
      stage: 'speech_headers', outcome: 'ok', elapsedMs: expect.any(Number), characters: phrase.length,
    }))
    const logs = JSON.stringify(info.mock.calls)
    expect(logs).not.toContain(phrase); expect(logs).not.toContain('secret-test-key')
  } finally { info.mockRestore() }
})
