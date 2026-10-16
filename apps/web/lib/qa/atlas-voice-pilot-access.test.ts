import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const s = vi.hoisted(() => ({
  user: { id: 'operator', email: 'operator@example.test' } as { id: string; email: string } | null,
  member: { role: 'owner', revoked_at: null } as { role: string; revoked_at: string | null } | null,
  membershipError: null as null | { message: string }, owns: false, ownershipError: false,
  hang: '', release: null as null | (() => void),
  getUser: vi.fn(), query: vi.fn(), provider: vi.fn(),
}))
function client() {
  return {
    auth: { getUser: s.getUser },
    from: (table: string) => ({ select: () => ({ eq: () => ({
      maybeSingle: async () => {
        s.query(table)
        if (s.hang === 'membership') await new Promise<void>(yes => { s.release = yes })
        return { data: s.member, error: s.membershipError }
      },
      limit: async () => ({ data: s.owns ? [{ id: 'owned' }] : [], error: s.ownershipError ? {} : null }),
    }) }) }),
  }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => client() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client() }))
vi.mock('@/lib/atlas/voice-pilot/elevenlabs', () => ({
  availableSwedishVoices: async () => { s.provider(); return ['anders'] },
  streamSwedishSpeech: async () => { s.provider(); return new Response(new Uint8Array([0, 0])) },
}))
vi.mock('@/lib/media/elevenlabs', () => ({ transcribeAtlasSwedishPcm: async () => { s.provider(); return 'Hej' } }))
import { middleware, config } from '@/middleware'
import { GET, POST } from '@/app/api/atlas/voice-pilot/speech/route'
const url = 'https://preview.test/api/atlas/voice-pilot/speech'
async function through(method: 'GET' | 'POST' = 'GET') {
  const request = new NextRequest(url, { method, headers: { origin: 'https://preview.test', 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ text: 'Hej', voice: 'anders' }) } : {}) })
  const response = await middleware(request)
  return response.headers.get('x-middleware-next') === '1' ? (method === 'GET' ? GET(request) : POST(request)) : response
}
beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('PLATFORM_OPERATOR_EMAILS', 'operator@example.test')
  s.user = { id: 'operator', email: 'operator@example.test' }
  s.member = { role: 'owner', revoked_at: null }; s.membershipError = null; s.owns = false; s.ownershipError = false
  s.hang = ''; s.release = null; s.provider.mockClear(); s.query.mockClear()
  s.getUser.mockReset().mockImplementation(async () => {
    if (s.hang === 'identity') await new Promise<void>(yes => { s.release = yes })
    return { data: { user: s.user } }
  })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
describe('voice requests through the actual middleware and route authority', () => {
  it.each(['/atlas-voice-recorder.js', '/atlas-vad/silero_vad_v5.onnx', '/atlas-vad/ort.wasm.min.mjs', '/atlas-vad/ort-wasm-simd-threaded.wasm', '/atlas-vad/ort-wasm-simd-threaded.mjs'])('serves public audio asset %s without depending on auth availability', async path => {
    const response = await middleware(new NextRequest('https://preview.test' + path))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(s.getUser).not.toHaveBeenCalled(); expect(s.query).not.toHaveBeenCalled()
    expect(new RegExp('^' + config.matcher[0] + '$').test(path)).toBe(false)
  })
  it.each(['GET', 'POST'] as const)('verifies identity exactly once for %s', async method => {
    expect((await through(method)).status).toBe(200)
    expect(s.getUser).toHaveBeenCalledTimes(1)
    expect(s.query.mock.calls).toEqual([['omnira_organization_memberships']])
    expect(s.provider).toHaveBeenCalledTimes(1)
  })
  it.each(['anonymous', 'nonoperator', 'collaborator', 'revoked', 'unknown', 'lookup_failure', 'ownership_failure', 'unconfigured'] as const)('denies %s before provider access', async scenario => {
    if (scenario === 'anonymous') s.user = null
    if (scenario === 'nonoperator') s.user!.email = 'other@example.test'
    if (scenario === 'collaborator') s.member = { role: 'collaborator', revoked_at: null }
    if (scenario === 'revoked') { s.member = { role: 'collaborator', revoked_at: 'yesterday' }; s.owns = true }
    if (scenario === 'unknown') s.member = null
    if (scenario === 'lookup_failure') { s.membershipError = { message: 'unavailable' }; s.member = null }
    if (scenario === 'ownership_failure') { s.member = null; s.owns = true; s.ownershipError = true }
    if (scenario === 'unconfigured') { vi.stubEnv('PLATFORM_OPERATOR_EMAILS', ''); vi.stubEnv('BREVO_ADMIN_EMAIL', '') }
    expect((await through('POST')).status).toBe(scenario === 'anonymous' ? 401 : 403)
    expect(s.provider).not.toHaveBeenCalled()
  })
  it('preserves the existing verified legacy-owner fallback', async () => {
    s.member = null; s.owns = true
    expect((await through()).status).toBe(200)
  })
  it('does not enable the preview route in production', async () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    expect((await through()).status).toBe(404); expect(s.provider).not.toHaveBeenCalled()
  })
  it.each(['identity', 'membership'])('fails closed promptly when %s stalls and never dispatches after late recovery', async stage => {
    vi.useFakeTimers(); s.hang = stage
    let response: Response | undefined
    const pending = through('POST').then(value => { response = value })
    await vi.advanceTimersByTimeAsync(5001)
    expect(response?.status).toBe(503)
    expect(await response!.json()).toMatchObject({ code: 'ATLAS_VOICE_AUTH_UNAVAILABLE' })
    s.release?.(); await pending; await vi.advanceTimersByTimeAsync(0)
    expect(s.provider).not.toHaveBeenCalled()
  })
  it.each(['/api/chat', '/api/atlas/voice-pilot/speech/extra', '/atlas-voice-recorder.js/private', '/atlas-vad/private', '/atlas-vad/silero_vad_v5.onnx/private'])('does not broaden middleware exceptions to %s', async path => {
    s.member = { role: 'collaborator', revoked_at: null }
    const result = await middleware(new NextRequest('https://preview.test' + path))
    expect(result.headers.get('x-middleware-next')).not.toBe('1')
  })
})
