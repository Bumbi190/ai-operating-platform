import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ resolve: vi.fn() }))
vi.mock('@/lib/auth/platform-operator', () => ({
  resolvePlatformOperator: auth.resolve,
}))
import { GET } from '@/app/api/system/provider-check/anthropic/route'

describe('Anthropic production credential diagnostic', () => {
  let call: ReturnType<typeof vi.fn>
  beforeEach(() => {
    vi.clearAllMocks()
    auth.resolve.mockResolvedValue({ ok: true, userId: 'test-operator' })
    vi.stubEnv('ANTHROPIC_API_KEY', 'synthetic-credential-do-not-use')
    call = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', call)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it.each([
    [{ ok: false, reason: 'unauthenticated' }, 401],
    [{ ok: false, reason: 'not_platform_operator' }, 403],
    [{ ok: false, reason: 'no_operator_configured' }, 403],
  ])('rejects unauthorised callers without touching Anthropic: %j', async (identity, code) => {
    auth.resolve.mockResolvedValue(identity)
    const response = await GET()
    expect(response.status).toBe(code)
    expect((await response.json()).credentialStatus).toBe('access_denied')
    expect(call).not.toHaveBeenCalled()
  })

  it('requires a configured server-only Anthropic API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '  ')
    const response = await GET()
    expect(response.status).toBe(503)
    expect((await response.json()).credentialStatus).toBe('not_configured')
    expect(call).not.toHaveBeenCalled()
  })

  it('validates exactly once using the pinned read-only provider endpoint', async () => {
    const response = await GET()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({
      provider: 'anthropic', credentialStatus: 'accepted',
      inferenceVerified: false, billableGenerationPerformed: false,
    })
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(call).toHaveBeenCalledTimes(1)
    const [url, init] = call.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/models?limit=1')
    expect(init.method).toBe('GET')
    expect(init.redirect).toBe('error')
    expect(init.cache).toBe('no-store')
    expect(init.headers).toMatchObject({ 'x-api-key': 'synthetic-credential-do-not-use', 'anthropic-version': '2023-06-01' })
    expect(JSON.stringify(body)).not.toContain('synthetic-credential-do-not-use')
  })

  it.each([
    [401, 'invalid_key', 502],
    [403, 'forbidden', 503],
    [429, 'unavailable', 503],
    [500, 'unavailable', 503],
  ])('converts provider HTTP %i to a closed, sanitized result', async (code, expected, status) => {
    call.mockImplementation(async () => new Response('SYNTHETIC-SECRET-PROVIDER-PAYLOAD', { status: code }))
    const response = await GET()
    const payload = await response.json()
    expect(response.status).toBe(status)
    expect(payload.credentialStatus).toBe(expected)
    expect(JSON.stringify(payload)).not.toContain('SECRET')
    expect(call).toHaveBeenCalledTimes(1)
  })

  it('fails closed on network errors without logging tokens or provider bodies', async () => {
    call.mockRejectedValueOnce(new Error('SYNTHETIC-SECRET-UPSTREAM-DETAIL'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const response = await GET()
      const body = await response.json()
      expect(response.status).toBe(503)
      expect(body.credentialStatus).toBe('unavailable')
      expect(JSON.stringify(body)).not.toContain('SYNTHETIC')
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})
