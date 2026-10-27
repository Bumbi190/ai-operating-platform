import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ calls: [] as any[], listed: [] as string[] }))
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: async () => ({ ok: true, reason: '' }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: 'owner', revoked_at: null }, error: null }) }) }) }),
}) }))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10.5, elevenlabs_usd_per_1k_chars: 0.24 }) }))
vi.mock('@/lib/cost/governed-spend', async orig => ({ ...(await orig<any>()),
  withGovernedSpend: async (input: unknown, run: () => Promise<Response>) => { state.calls.push('spend'); return run() },
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/governance/execution-signal', async orig => ({ ...(await orig<any>()),
  admitPhysicalRequest: async () => { state.calls.push('admit') },
  watchExecutionAuthority: () => ({ signal: new AbortController().signal, abortReason: null, dispose: () => {} }),
}))
import { GET, POST } from '@/app/api/atlas/voice-pilot/speech/route'
import { availableSwedishVoices } from '@/lib/atlas/voice-pilot/elevenlabs'
import { REJECTED_NOVA_ELEVENLABS_VOICE_ID, resolveNovaVoiceId } from '@/lib/atlas/voice-pilot/nova-voice'

const ANDERS = 'DSL3PSQNPbkOavwmnYl1', PETER = 'oJEeOXECH9V31Oci9WHK', NOVA = 'AbCdEfGhIjKlMnOpQrSt'
const post = (voice: string) => new Request('https://preview.test/api/atlas/voice-pilot/speech', {
  method: 'POST', headers: { origin: 'https://preview.test', 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Hej', voice }),
})
const get = () => new Request('https://preview.test/api/atlas/voice-pilot/speech')
let fetcher: ReturnType<typeof vi.fn>
const approve = (id: string, approved = 'true') => { vi.stubEnv('ATLAS_NOVA_VOICE_ID', id); vi.stubEnv('ATLAS_NOVA_VOICE_APPROVED', approved) }
beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('ELEVENLABS_API_KEY', 'secret-test-key')
  vi.stubEnv('ATLAS_NOVA_VOICE_ID', ''); vi.stubEnv('ATLAS_NOVA_VOICE_APPROVED', '')
  state.calls = []; state.listed = [ANDERS, PETER, NOVA]
  fetcher = vi.fn(async (url: string) => {
    if (url.includes('/v2/voices?')) {
      const asked = new URL(url).searchParams.getAll('voice_ids')
      return Response.json({ voices: asked.filter(id => state.listed.includes(id)).map(voice_id => ({ voice_id })) })
    }
    state.calls.push('dispatch:' + url.split('/text-to-speech/')[1].split('/')[0])
    return new Response(new Uint8Array([0, 64]))
  })
  vi.stubGlobal('fetch', fetcher)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe('Nova (Agent Office) dormant voice option', () => {
  it('is absent by default: no env means Anders and Peter only, and the lookup never asks about Nova', async () => {
    expect(await availableSwedishVoices(new AbortController().signal)).toEqual(['anders', 'peter'])
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.getAll('voice_ids')).toEqual([ANDERS, PETER])
    const body = await (await GET(get())).json()
    expect(body.voices.map((v: any) => v.key)).toEqual(['anders', 'peter'])
    expect(JSON.stringify(body)).not.toMatch(/nova/i)
  })
  it('never resolves the rejected ID, even with the approval flag true (case-insensitive)', () => {
    for (const id of [REJECTED_NOVA_ELEVENLABS_VOICE_ID, REJECTED_NOVA_ELEVENLABS_VOICE_ID.toLowerCase()]) {
      expect(resolveNovaVoiceId({ ATLAS_NOVA_VOICE_ID: id, ATLAS_NOVA_VOICE_APPROVED: 'true' })).toBeNull()
    }
  })
  it('rejects invalid IDs and anything but an explicit true approval', () => {
    for (const id of ['', 'short', NOVA + 'x', 'AbCdEfGhIjKlMnOpQr-_', 'AbCdEfGhIjKlMnOpQr S']) {
      expect(resolveNovaVoiceId({ ATLAS_NOVA_VOICE_ID: id, ATLAS_NOVA_VOICE_APPROVED: 'true' })).toBeNull()
    }
    for (const flag of [undefined, '', 'false', '1', 'yes', 'TRUE']) {
      expect(resolveNovaVoiceId({ ATLAS_NOVA_VOICE_ID: NOVA, ATLAS_NOVA_VOICE_APPROVED: flag })).toBeNull()
    }
    expect(resolveNovaVoiceId({ ATLAS_NOVA_VOICE_APPROVED: 'true' })).toBeNull()
  })
  it('does not list Nova for an invalid, rejected or unapproved configuration', async () => {
    for (const [id, flag] of [['short', 'true'], [REJECTED_NOVA_ELEVENLABS_VOICE_ID, 'true'], [NOVA, 'false'], [NOVA, '']] as const) {
      approve(id, flag); state.listed = [ANDERS, PETER, id]
      expect(await availableSwedishVoices(new AbortController().signal)).toEqual(['anders', 'peter'])
    }
  })
  it('lists Nova last, with its label and no ID, only when approved, valid and provider-confirmed', async () => {
    approve(NOVA)
    expect(await availableSwedishVoices(new AbortController().signal)).toEqual(['anders', 'peter', 'nova'])
    const text = await (await GET(get())).text()
    expect(JSON.parse(text).voices).toEqual([
      { key: 'anders', label: 'Anders · varm rikssvenska' }, { key: 'peter', label: 'Peter · naturlig skånska' },
      { key: 'nova', label: 'Nova (Agent Office)' },
    ])
    expect(text).not.toContain(NOVA)
    state.listed = [ANDERS, PETER] // provider no longer confirms the voice
    expect(await availableSwedishVoices(new AbortController().signal)).toEqual(['anders', 'peter'])
  })
  it('denies a Nova request before any provider lookup, budget or paid call when unset or unapproved', async () => {
    expect((await POST(post('nova'))).status).toBe(503)
    approve(NOVA, 'false'); expect((await POST(post('nova'))).status).toBe(503)
    approve(REJECTED_NOVA_ELEVENLABS_VOICE_ID); expect((await POST(post('nova'))).status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled(); expect(state.calls).toEqual([])
  })
  it('routes an approved Nova request through the same adapter, still gated by the fresh provider lookup', async () => {
    approve(NOVA)
    expect((await POST(post('nova'))).status).toBe(200)
    expect(state.calls).toEqual(['spend', 'admit', 'dispatch:' + NOVA])
    state.calls = []; state.listed = [ANDERS, PETER]
    expect((await POST(post('nova'))).status).toBe(503)
    expect(state.calls).toEqual([])
  })
  it('leaves Anders and Peter unchanged whether or not Nova is configured', async () => {
    for (const configured of [false, true]) {
      if (configured) approve(NOVA)
      state.calls = []
      expect((await POST(post('anders'))).status).toBe(200)
      expect((await POST(post('peter'))).status).toBe(200)
      expect(state.calls.filter(c => String(c).startsWith('dispatch'))).toEqual(['dispatch:' + ANDERS, 'dispatch:' + PETER])
    }
    expect((await POST(post('victoria'))).status).toBe(400)
  })
})
