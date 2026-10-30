import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  operator: vi.fn(), gate: vi.fn(), rates: vi.fn(),
  estimate: vi.fn(), generate: vi.fn(),
}))
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: mock.operator }))
vi.mock('@/lib/cost/spend-gate-flag', () => ({ isSpendGateEnforced: mock.gate }))
vi.mock('@/lib/cost/rates', () => ({ getRates: mock.rates }))
vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: (ctx: unknown) => ({ messages: { create: (params: unknown) => mock.generate(ctx, params) } }),
  estimateAnthropicSek: mock.estimate,
}))
import { GET, POST } from '@/app/api/system/provider-check/anthropic/smoke/route'
import { SpendRefusedError } from '@/lib/cost/governed-spend'

const url = 'https://app.omniraos.se/api/system/provider-check/anthropic/smoke'
function request(origin = 'https://app.omniraos.se', body = '') {
  return new Request(url, { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body })
}
beforeEach(() => {
  vi.clearAllMocks()
  mock.operator.mockResolvedValue({ ok: true, userId: 'operator-id' })
  mock.gate.mockReturnValue(true)
  mock.rates.mockResolvedValue({ usd_sek: 10 })
  mock.estimate.mockResolvedValue(2.2)
  mock.generate.mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'READY' }],
    usage: { input_tokens: 12, output_tokens: 4 },
  })
})
afterEach(() => { vi.restoreAllMocks() })

describe('Anthropic single-use governed production inference smoke', () => {
  it.each([
    [{ ok: false, reason: 'unauthenticated' }, 401],
    [{ ok: false, reason: 'not_platform_operator' }, 403],
  ])('rejects unauthorized GET/POST before provider or metering: %j', async (identity, code) => {
    mock.operator.mockResolvedValue(identity)
    const get = await GET(), post = await POST(request())
    expect(get.status).toBe(code)
    expect(post.status).toBe(code)
    expect(mock.estimate).not.toHaveBeenCalled()
    expect(mock.generate).not.toHaveBeenCalled()
  })

  it('renders an inert page with an explicit POST consent action', async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('<form method="POST">')
    expect(html).toContain('Maximal reserverad kostnad: 3 SEK')
    expect(response.headers.get('Referrer-Policy')).toBe('same-origin')
    expect(mock.generate).not.toHaveBeenCalled()
  })

  it.each([
    ['https://evil.test', '', 403],
    ['', '', 403],
    ['https://app.omniraos.se', 'model=opus', 400],
  ])('refuses cross-site, absent-origin or caller-controlled POST: %s', async (origin, body, status) => {
    const response = await POST(request(origin, body))
    expect(response.status).toBe(status)
    expect(mock.generate).not.toHaveBeenCalled()
  })

  it('refuses a non-enforced budget gate without a provider request', async () => {
    mock.gate.mockReturnValue(false)
    expect((await POST(request())).status).toBe(503)
    expect(mock.estimate).not.toHaveBeenCalled()
    expect(mock.generate).not.toHaveBeenCalled()
  })

  it.each([0, 3.0001, Infinity])('rejects a nonpositive or excessive hard ceiling: %s', async amount => {
    mock.estimate.mockResolvedValue(amount)
    const response = await POST(request())
    expect((await response.json()).status).toBe('cost_ceiling_refused')
    expect(mock.generate).not.toHaveBeenCalled()
  })

  it('makes exactly one governed low-token Haiku request with immutable dispatch identity', async () => {
    const res = await POST(request())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ provider: 'anthropic', status: 'inference_verified',
      inferenceVerified: true, billableGenerationPerformed: true,
      inputTokens: 12, outputTokens: 4, model: 'claude-haiku-4-5-20251001' })
    expect(mock.generate).toHaveBeenCalledTimes(1)
    const [ctx, params] = mock.generate.mock.calls[0]
    expect(ctx).toMatchObject({
      project: { projectSlug: 'ai-media-automation' },
      execution: { context: 'OPERATOR_INTERACTIVE', scope: expect.anything() },
      agent: 'Provider Diagnostics', operation: 'Anthropic Production Smoke',
      idempotencyKey: 'omnira-anthropic-production-smoke-20261023-v1',
    })
    expect(params).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 24,
      messages: [{ role: 'user', content: expect.any(String) }],
    })
    expect(JSON.stringify(json)).not.toContain('READY')
  })

  it('distinguishes an incomplete but possibly billed result from a provider failure', async () => {
    mock.generate.mockResolvedValueOnce({
      stop_reason: 'max_tokens', content: [{ type: 'text', text: 'READY' }],
      usage: { input_tokens: 14, output_tokens: 24 },
    })
    const res = await POST(request())
    const body = await res.json()
    expect(res.status).toBe(502)
    expect(body.status).toBe('inference_incomplete')
    expect(body.billableGenerationPerformed).toBe(true)
    expect(body.inferenceVerified).toBe(false)
  })

  it('preserves budget refusal and never reveals provider details', async () => {
    mock.generate.mockRejectedValueOnce(new SpendRefusedError({
      reason: 'budget_exceeded', provider: 'anthropic', operation: 'Anthropic Production Smoke',
    }))
    const res = await POST(request())
    expect(res.status).toBe(409)
    expect((await res.json()).status).toBe('spend_refused')
    const evil = new Error('SYNTHETIC_SENSITIVE_PROVIDER_PAYLOAD')
    mock.generate.mockRejectedValueOnce(evil)
    const again = await POST(request())
    expect(again.status).toBe(503)
    expect(JSON.stringify(await again.json())).not.toContain('SENSITIVE')
  })
})
