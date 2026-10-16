import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ auth: { ok: true, reason: '' }, calls: [] as any[], rate: 0.27 as number | undefined, refused: false, mode: 'ok', disposed: vi.fn() }))
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: async () => state.auth }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner', revoked_at: null }, error: null }) }) }) }),
}) }))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10.5, elevenlabs_scribe_v2_keyterms_usd_per_hour: state.rate }) }))
vi.mock('@/lib/cost/governed-spend', async orig => ({ ...(await orig<any>()), withGovernedSpend: async (input: unknown, run: () => Promise<unknown>) => {
  state.calls.push(input); if (state.refused) throw new Error('budget'); return run()
} }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/governance/execution-signal', async orig => ({ ...(await orig<any>()),
  admitPhysicalRequest: async () => { state.calls.push('admit') },
  watchExecutionAuthority: () => ({ signal: new AbortController().signal, abortReason: null, dispose: state.disposed }),
}))
import { POST } from '@/app/api/atlas/voice-pilot/speech/route'
import { transcribeAtlasSwedishPcm } from '@/lib/media/elevenlabs'
const post = (bytes = new Uint8Array(64000), origin = 'https://preview.test') => new Request('https://preview.test/api/atlas/voice-pilot/speech', {
  method: 'POST', headers: { origin, 'Content-Type': 'audio/pcm' }, body: bytes,
})
let fetcher: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('ELEVENLABS_API_KEY', 'secret-test-key')
  state.auth = { ok: true, reason: '' }; state.calls = []; state.rate = 0.27; state.mode = 'ok'; state.refused = false; state.disposed.mockClear()
  fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    state.calls.push('dispatch')
    if (state.mode === 'reset') throw new Error('socket lost')
    if (state.mode === 'rejected') return new Response('private-provider-detail', { status: 401 })
    if (state.mode === 'hanging') return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    return Response.json({ text: 'Kolla konkurrenterna till Handlarbörsen.', language_code: 'swe', language_probability: 0.98, words: [] })
  })
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
describe('bounded Swedish transcription on the existing trial boundary', () => {
  it('authenticates before reading audio or reserving spend', async () => {
    vi.stubEnv('VERCEL_ENV', 'production'); expect((await POST(post())).status).toBe(404)
    vi.stubEnv('VERCEL_ENV', 'preview'); state.auth = { ok: false, reason: 'not_platform_operator' }
    expect((await POST(post())).status).toBe(403)
    expect(state.calls).toEqual([])
  })
  it('rejects cross-origin, short, odd-length and oversized actual bodies before dispatch', async () => {
    expect((await POST(post(undefined, 'https://evil.test'))).status).toBe(403)
    for (const length of [0, 3198, 3201, 2880002]) expect((await POST(post(new Uint8Array(length)))).status).toBeGreaterThanOrEqual(400)
    expect(state.calls).toEqual([])
  })
  it('reserves duration from PCM bytes and fixes Swedish, model, format and domain names server-side', async () => {
    const response = await POST(post())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ text: 'Kolla konkurrenterna till Handlarbörsen.' })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(state.calls).toEqual([expect.objectContaining({ provider: 'elevenlabs', ceilingBasis: 'fixed_units', estimatedSek: 0.27 / 60 * 10.5,
      execution: { context: 'OPERATOR_INTERACTIVE', scope: { kind: 'GLOBAL_ONLY' } } }), 'admit', 'dispatch'])
    const body = fetcher.mock.calls[0][1].body as FormData
    expect(body.get('model_id')).toBe('scribe_v2'); expect(body.get('language_code')).toBe('swe'); expect(body.get('file_format')).toBe('pcm_s16le_16')
    expect(body.getAll('keyterms')).toContain('Handlarbörsen')
    expect((body.get('file') as Blob).size).toBe(64000)
    expect(body.has('source_url')).toBe(false); expect(body.has('transcript_edit')).toBe(false)
    expect(state.disposed).toHaveBeenCalledTimes(1)
  })
  it('reserves two whole minutes for a 90-second recording', async () => {
    expect((await POST(post(new Uint8Array(2880000)))).status).toBe(200)
    expect(state.calls[0].estimatedSek).toBeCloseTo(2 * 0.27 / 60 * 10.5, 12)
  })
  it.each([undefined, NaN, Infinity, -1, 0])('refuses unusable canonical rate %s without provider dispatch', async rate => {
    state.rate = rate
    expect((await POST(post())).status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled(); expect(state.calls).toEqual([])
  })
  it('does not dispatch when the budget refuses and never retries ambiguous transport failures', async () => {
    state.refused = true; expect((await POST(post())).status).toBe(503); expect(fetcher).not.toHaveBeenCalled()
    state.refused = false; state.mode = 'reset'; expect((await POST(post())).status).toBe(503)
    expect(fetcher).toHaveBeenCalledTimes(1); expect(state.disposed).toHaveBeenCalledTimes(1)
  })
  it('keeps the authority watch until a canceled request settles and exposes no provider details', async () => {
    state.mode = 'hanging'; const abort = new AbortController()
    const pending = POST(new Request(post(), { signal: abort.signal }))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    expect(state.disposed).not.toHaveBeenCalled(); abort.abort()
    expect((await pending).status).toBe(503); expect(state.disposed).toHaveBeenCalledTimes(1)
    state.mode = 'rejected'
    expect(await (await POST(post())).text()).not.toContain('private-provider-detail')
  })
})

it('reports transcription duration without recording the transcript', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {})
  try {
    const response = await POST(post())
    const result = await response.json()
    expect(response.headers.get('server-timing')).toMatch(/^atlas_transcription;dur=\d+$/)
    expect(info).toHaveBeenCalledWith('[atlas-voice-trial]', expect.objectContaining({
      stage: 'transcription', outcome: 'ok', elapsedMs: expect.any(Number), audioMs: 2000,
    }))
    const logs = JSON.stringify(info.mock.calls)
    expect(logs).not.toContain(result.text); expect(logs).not.toContain('secret-test-key')
  } finally { info.mockRestore() }
})
