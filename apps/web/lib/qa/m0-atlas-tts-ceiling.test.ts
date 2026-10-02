/**
 * M0 — Atlas TTS product-compatibility proof.
 *
 * Product decision for the M0 rollout: Atlas TTS speaks with `tts-1` (billed per
 * input character) so its spend has a HARD ceiling. This suite drives the REAL
 * `/api/chat/tts` route through the REAL `withGovernedSpend`, mocking only the
 * budget RPCs, auth, the stop decision, physical admission and the network, and
 * proves mechanically:
 *
 *   reservation = Atlas input chars × openai_tts_1_usd_per_1k_chars × pinned usd_sek
 *   settlement  = that same reservation (speech is never metered → the
 *                 settlement is `estimate_unmetered`, which the database records
 *                 at the reserved amount — proven in m0-durable-spend-sql)
 *
 * The canonical rate is READ FROM THE M0 MIGRATION, so this suite fails if the
 * migration row and the proof ever disagree.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const MIGRATION = readFileSync(join(process.cwd(),
  'supabase/migrations/20261001160000_m0_durable_spend_settlement.sql'), 'utf8')
const TTS1_RATE = Number(/values \('openai_tts_1_usd_per_1k_chars', ([0-9.]+),/.exec(MIGRATION)?.[1])

/** cost_rates as read from production on 2026-10-02, plus the M0 migration row. */
const M0_PRODUCTION_RATES = {
  usd_sek: 10.5, elevenlabs_usd_per_1k_chars: 0.24, ideogram_v3_usd_per_image: 0.08,
  gpt_image_usd_per_image: 0.042, openai_tts_1_usd_per_1k_chars: TTS1_RATE,
}

const getRates = vi.fn()
const reserveSpend = vi.fn()
const markSpendDispatchIntent = vi.fn()
const settleSpend = vi.fn()
const releaseSpend = vi.fn()
const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = []

vi.mock('@/lib/auth/session', () => ({ requireUserSession: async () => ({ ok: true, userId: 'u1' }) }))
vi.mock('@/lib/cost/rates', () => ({ getRates: () => getRates() }))
vi.mock('@/lib/cost/advisory-override', () => ({ recordAdvisoryOverride: async () => undefined }))
vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: (a: unknown) => reserveSpend(a),
  markSpendDispatchIntent: (...a: unknown[]) => markSpendDispatchIntent(...a),
  settleSpend: (...a: unknown[]) => settleSpend(...a),
  releaseSpend: (...a: unknown[]) => releaseSpend(...a),
  openOverrideReservation: async () => null,
}))
vi.mock('@/lib/governance/execution-stop', async (orig) => ({
  ...await orig<typeof import('@/lib/governance/execution-stop')>(),
  resolveExecutionStopForContract: async () => ({
    allowed: true, context: 'OPERATOR_INTERACTIVE', scopesEvaluated: ['PLATFORM_AUTOMATION'],
    resolution: 'RESOLVED', globalPaused: false, projectPaused: null, reason: null, observed: null,
  }),
}))
vi.mock('@/lib/governance/execution-signal', async (orig) => ({
  ...await orig<typeof import('@/lib/governance/execution-signal')>(),
  admitPhysicalRequest: async () => undefined,
  watchExecutionAuthority: () => ({
    signal: new AbortController().signal, dispose: () => {}, authorityUnavailable: false, abortReason: null,
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 'proj-media' }, error: null }) }) }) }) }),
    rpc: async () => ({ data: null, error: null }),
  }),
}))

async function speak(body: Record<string, unknown>) {
  const { POST } = await import('@/app/api/chat/tts/route')
  return POST(new Request('http://localhost/api/chat/tts', { method: 'POST', body: JSON.stringify(body) }))
}

const sek = (chars: number) => (chars / 1000) * TTS1_RATE * M0_PRODUCTION_RATES.usd_sek

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  fetchCalls.length = 0
  process.env.OPENAI_API_KEY = 'test-key'
  getRates.mockResolvedValue(M0_PRODUCTION_RATES)
  reserveSpend.mockResolvedValue({ allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
    reservationId: 'res-tts', budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700, bindingScope: null })
  markSpendDispatchIntent.mockResolvedValue(true)
  settleSpend.mockResolvedValue({ settled: true, result: 'settled', settledSek: 0, ceilingExceeded: false })
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, body: JSON.parse(String(init.body)) })
    return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } })
  }) as never
})

describe('the canonical tts-1 rate comes from the M0 migration', () => {
  it('is 0.015 USD / 1k characters (15 USD / 1M), and there is no gpt-4o-mini-tts row', () => {
    expect(TTS1_RATE).toBe(0.015)
    expect(MIGRATION).not.toMatch(/'openai_gpt_4o_mini_tts|gpt-4o-mini-tts_usd|gpt_4o_mini_tts_usd/)
  })
})

describe('Atlas TTS under the M0 production price book', () => {
  it('reservation = input chars × openai_tts_1_usd_per_1k_chars × pinned usd_sek, basis fixed_units', async () => {
    const text = 'Hej, jag är Atlas.'
    const res = await speak({ text })
    expect(res.status).toBe(200)
    const [reserved] = reserveSpend.mock.calls[0]
    expect(reserved.estimatedSek).toBeCloseTo(sek(text.length), 12)
    expect(markSpendDispatchIntent).toHaveBeenCalledWith('res-tts', expect.any(String), 'fixed_units')
  })

  it('the MAXIMUM Atlas reservation is the 600-character cap: 600/1000 × 0.015 × 10.5 = 0.0945 SEK', async () => {
    const res = await speak({ text: 'å'.repeat(5_000) })
    expect(res.status).toBe(200)
    expect(fetchCalls[0].body.input).toHaveLength(600)
    expect(reserveSpend.mock.calls[0][0].estimatedSek).toBeCloseTo(0.0945, 12)
  })

  it('settlement is the SAME reservation: unmetered, no rows, same dispatch token — and a mid-flight rate edit cannot move it', async () => {
    let calls = 0
    getRates.mockImplementation(async () => (++calls === 1 ? M0_PRODUCTION_RATES
      : { ...M0_PRODUCTION_RATES, usd_sek: 99, openai_tts_1_usd_per_1k_chars: 1 }))   // edited after reserving
    await speak({ text: 'x'.repeat(600) })
    const token = markSpendDispatchIntent.mock.calls[0][1]
    await vi.waitFor(() => expect(settleSpend).toHaveBeenCalled())
    expect(settleSpend).toHaveBeenCalledWith('res-tts', { dispatchToken: token, kind: 'estimate_unmetered', rows: [] })
    // The only priced figure for this call is the reservation, taken from the first (pinned) snapshot.
    expect(reserveSpend.mock.calls[0][0].estimatedSek).toBeCloseTo(0.0945, 12)
    expect(releaseSpend).not.toHaveBeenCalled()
  })
})

describe('product regression checks', () => {
  it('model tts-1, voice onyx, mp3, exactly the four default fields — no `instructions`', async () => {
    const res = await speak({ text: 'Hej' })
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe('https://api.openai.com/v1/audio/speech')
    expect(fetchCalls[0].body).toEqual({ model: 'tts-1', voice: 'onyx', input: 'Hej', response_format: 'mp3' })
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
    const route = readFileSync(join(process.cwd(), 'app/api/chat/tts/route.ts'), 'utf8')
      .replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
    expect(route).not.toMatch(/instructions/)
  })

  it('an explicit speed is still forwarded and clamped', async () => {
    await speak({ text: 'Hej', speed: 9 })
    expect(fetchCalls[0].body.speed).toBe(4)
    await speak({ text: 'Hej', speed: 1.2 })
    expect(fetchCalls[1].body.speed).toBe(1.2)
  })

  it('Atlas TTS no longer returns unbounded_spend under the M0 production price book', async () => {
    const res = await speak({ text: 'Hej' })
    expect(res.status).toBe(200)
    expect(reserveSpend).toHaveBeenCalledTimes(1)
  })

  it('gpt-4o-mini-tts stays REFUSED by the generic hard-ceiling layer — even with the full M0 price book', async () => {
    const { estimateOpenAISpeechSek } = await import('@/lib/ai/openai-client')
    await expect(estimateOpenAISpeechSek(600, M0_PRODUCTION_RATES, 'gpt-4o-mini-tts'))
      .rejects.toMatchObject({ reason: 'unbounded_spend' })
    const { openAISpeechCeiling } = await import('@/lib/cost/spend-ceiling')
    expect(openAISpeechCeiling(600, 'gpt-4o-mini-tts', { ...M0_PRODUCTION_RATES, openai_gpt_4o_mini_tts_usd_per_1k_chars: 1 }).ok)
      .toBe(false)                                                // no rate key can make it pass
  })
})
