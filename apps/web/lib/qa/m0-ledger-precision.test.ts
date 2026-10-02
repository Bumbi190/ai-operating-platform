/**
 * M0 — hard ceilings are quantized UP to the SEK ledger scale.
 *
 * `spend_reservations.estimated_sek`, `actual_sek` and `cost_events.cost_sek`
 * are `numeric(12,4)`, and Postgres rounds a written value to NEAREST. Production
 * (2026-10-02, Atlas TTS, 18 chars) derived a 0.002835 SEK ceiling and stored
 * 0.0028 — a held amount below the hard ceiling, which breaks M0's invariant
 * `held ≥ every permitted billable outcome`.
 *
 * The fix is ONE helper (`ceilToLedgerScale`) applied ONCE, centrally, in
 * `withGovernedSpend` before anything is reserved, recorded or persisted. These
 * tests prove the helper (including float edge cases, property-style) and that
 * every governed amount the ledger sees is the quantized one.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TEST_AUTONOMOUS_GLOBAL } from './execution-fixtures'
import {
  SEK_LEDGER_SCALE, ceilToLedgerScale, fixedUnitCeiling, openAISpeechCeiling, tokenWindowCeiling,
  CONTEXT_WINDOW_TOKENS,
} from '@/lib/cost/spend-ceiling'

const reserveSpend = vi.fn()
const settleSpend = vi.fn()
const openOverrideReservation = vi.fn()
const recordAdvisoryOverride = vi.fn()
vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: (...a: unknown[]) => reserveSpend(...a),
  settleSpend: (...a: unknown[]) => settleSpend(...a),
  releaseSpend: async () => undefined,
  markSpendDispatchIntent: async () => true,
  openOverrideReservation: (...a: unknown[]) => openOverrideReservation(...a),
}))
vi.mock('@/lib/cost/advisory-override', () => ({ recordAdvisoryOverride: (a: unknown) => recordAdvisoryOverride(a) }))
vi.mock('@/lib/governance/execution-stop', async (orig) => ({
  ...await orig<typeof import('@/lib/governance/execution-stop')>(),
  resolveExecutionStopForContract: async () => ({
    allowed: true, context: 'AUTONOMOUS', scopesEvaluated: ['PLATFORM_AUTOMATION'],
    resolution: 'RESOLVED', globalPaused: false, projectPaused: null, reason: null, observed: null,
  }),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

/** cost_rates as read from production on 2026-10-02 (incl. the M0 tts-1 row). */
const PROD_RATES = {
  usd_sek: 10.5, elevenlabs_usd_per_1k_chars: 0.24, ideogram_v3_usd_per_image: 0.08,
  gpt_image_usd_per_image: 0.042, openai_tts_1_usd_per_1k_chars: 0.015,
}

/** Exactly what Postgres stores for a number written to numeric(12,4): round half away from zero. */
function storedAsNumeric4(value: number): number {
  const s = String(value)                                      // what supabase-js serializes
  expect(s).not.toMatch(/e/i)                                  // plain decimal, no exponent
  const [, frac = ''] = s.split('.')
  if (frac.length <= SEK_LEDGER_SCALE) return Number(s)        // stored exactly
  return Math.round(Number(s) * 10 ** SEK_LEDGER_SCALE) / 10 ** SEK_LEDGER_SCALE
}

const decimals = (x: number) => (String(x).split('.')[1] ?? '').length

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  reserveSpend.mockResolvedValue({ allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
    reservationId: 'res-1', budgetSek: 700, committedSek: 0, reservedSek: 0, headroomSek: 700, bindingScope: null })
  settleSpend.mockResolvedValue({ settled: true, result: 'settled', settledSek: 0, ceilingExceeded: false })
  openOverrideReservation.mockResolvedValue('res-override')
  recordAdvisoryOverride.mockResolvedValue(undefined)
})

// ── The helper ───────────────────────────────────────────────────────────────

describe('ceilToLedgerScale: the smallest 4-decimal amount ≥ the ceiling', () => {
  it('the ledger scale is the numeric(12,4) scale', () => {
    expect(SEK_LEDGER_SCALE).toBe(4)
  })

  it.each([
    [0.002835, 0.0029],
    [1.23451, 1.2346],
    [1.2345, 1.2345],
    [0.0945, 0.0945],
    [0.00001, 0.0001],
    [5, 5],
    [99999999.99995, 100000000],
  ])('%s → %s', (raw, expected) => {
    expect(ceilToLedgerScale(raw)).toBe(expected)
  })

  it('zero stays zero; invalid amounts pass through for the caller to refuse', () => {
    expect(ceilToLedgerScale(0)).toBe(0)
    expect(ceilToLedgerScale(-1)).toBe(-1)
    expect(ceilToLedgerScale(Number.NaN)).toBeNaN()
    expect(ceilToLedgerScale(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
  })

  it('float edge: the computed Atlas ceilings sit a hair BELOW their decimals and still land exactly', () => {
    const tts = (chars: number) => chars / 1000 * 0.015 * 10.5
    expect(tts(18)).toBe(0.0028349999999999994)
    expect(ceilToLedgerScale(tts(18))).toBe(0.0029)
    expect(tts(600)).toBe(0.09449999999999999)
    expect(ceilToLedgerScale(tts(600))).toBe(0.0945)             // not 0.0946
  })

  it('values just ABOVE a 4-decimal boundary round UP — even by a single ulp', () => {
    for (const boundary of [0.0001, 0.0945, 1.2345, 6.489, 700.1234]) {
      const ulpAbove = boundary + Math.max(Number.EPSILON * boundary, Number.MIN_VALUE)
      const next = Number((boundary + 0.0001).toFixed(4))
      expect(ulpAbove).toBeGreaterThan(boundary)
      expect(ceilToLedgerScale(ulpAbove)).toBe(next)
      expect(ceilToLedgerScale(boundary + 1e-9)).toBe(next)
    }
  })

  it('already-aligned values do not drift (every k / 10^4 for k up to 2·10^6, plus large ones)', () => {
    for (let k = 0; k <= 2_000_000; k += 1) {
      const v = k / 10_000
      if (ceilToLedgerScale(v) !== v) throw new Error(`drifted at ${v}`)
    }
    for (const v of [12345.6789, 99999999.9999, 4000.5]) expect(ceilToLedgerScale(v)).toBe(v)
  })

  it('property: for many positive finite values the result is ≥ the input, minimal, ≤ one quantum above, and stored exactly', () => {
    let seed = 0x9e3779b9
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
    for (let i = 0; i < 200_000; i += 1) {
      const magnitude = 10 ** (Math.floor(rand() * 12) - 7)       // 1e-7 … 1e4 SEK
      const x = rand() * magnitude
      if (!(x > 0)) continue
      const q = ceilToLedgerScale(x)
      if (!(q >= x)) throw new Error(`under-reserved: ${x} → ${q}`)
      if (!(q - 0.0001 < x)) throw new Error(`not minimal: ${x} → ${q}`)
      if (decimals(q) > SEK_LEDGER_SCALE) throw new Error(`not on the ledger scale: ${x} → ${q}`)
      if (storedAsNumeric4(q) !== q) throw new Error(`database would change it: ${q}`)
    }
  })
})

// ── Representative provider ceilings: stored ≥ derived ───────────────────────

describe('stored estimated_sek ≥ the raw derived ceiling, for representative provider ceilings', () => {
  const assertCovered = (raw: number, label: string) => {
    const reserved = ceilToLedgerScale(raw)
    const stored = storedAsNumeric4(reserved)
    if (!(stored >= raw)) throw new Error(`${label}: stored ${stored} < raw ${raw}`)
    // And the bug this closes: the UNQUANTIZED value can be stored below itself.
    return storedAsNumeric4(raw) < raw
  }

  it('Atlas TTS (tts-1) for every input length 1…600 chars', () => {
    let unquantizedWouldUnderReserve = 0
    for (let chars = 1; chars <= 600; chars += 1) {
      const c = openAISpeechCeiling(chars, 'tts-1', PROD_RATES)
      if (!c.ok) throw new Error('tts-1 must be boundable')
      if (assertCovered(c.sek, `tts ${chars}`)) unquantizedWouldUnderReserve += 1
    }
    expect(unquantizedWouldUnderReserve).toBeGreaterThan(0)       // the defect was real
  })

  it('token-window ceilings for every boundable model across output caps', () => {
    for (const model of Object.keys(CONTEXT_WINDOW_TOKENS)) {
      for (const cap of [1, 7, 150, 1200, 4096, 8192]) {
        const c = tokenWindowCeiling(model, cap, PROD_RATES)
        if (c.ok) assertCovered(c.sek, `${model}/${cap}`)
      }
    }
  })

  it('fixed-unit ceilings (images, voice characters, per-second sound)', () => {
    for (const [units, usd] of [[1, 0.08], [3, 0.042], [1.234, 0.24], [7, 0.0123457], [0.001, 0.015]] as const) {
      const c = fixedUnitCeiling(units, usd, PROD_RATES, 'probe')
      if (c.ok) assertCovered(c.sek, `fixed ${units}×${usd}`)
    }
  })
})

// ── Applied centrally, before anything reaches the ledger ────────────────────

const governed = (estimatedSek: number, basis: 'token_window' | 'fixed_units' | 'internal_fixed' = 'fixed_units') => ({
  project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL,
  provider: 'openai', operation: 'Atlas TTS', estimatedSek,
  ceilingBasis: basis, rates: PROD_RATES,
})

describe('withGovernedSpend quantizes ONCE, before reserve / override / advisory record', () => {
  it('the 18-char Atlas TTS ceiling reserves 0.0029 SEK, not 0.002835 (stored 0.0028)', async () => {
    const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
    await withGovernedSpend(governed(18 / 1000 * 0.015 * 10.5), async () => 'ok')
    expect(reserveSpend.mock.calls[0][0].estimatedSek).toBe(0.0029)
    expect(recordAdvisoryOverride.mock.calls[0][0].estimatedSek).toBe(0.0029)
  })

  it('the 600-char Atlas cap still reserves exactly 0.0945 SEK', async () => {
    const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
    await withGovernedSpend(governed(600 / 1000 * 0.015 * 10.5), async () => 'ok')
    expect(reserveSpend.mock.calls[0][0].estimatedSek).toBe(0.0945)
  })

  it('every basis receives the same treatment (token_window, fixed_units, internal_fixed)', async () => {
    const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
    for (const basis of ['token_window', 'fixed_units', 'internal_fixed'] as const) {
      await withGovernedSpend(governed(6.48901, basis), async () => 'ok')
    }
    expect(reserveSpend.mock.calls.map(c => c[0].estimatedSek)).toEqual([6.4891, 6.4891, 6.4891])
  })

  it('a real token-window ceiling through the governed Anthropic adapter is reserved quantized and ≥ raw', async () => {
    vi.doMock('@/lib/cost/rates', () => ({ getRates: async () => PROD_RATES }))
    vi.doMock('@/lib/governance/execution-signal', async (orig) => ({
      ...await orig<typeof import('@/lib/governance/execution-signal')>(),
      admitPhysicalRequest: async () => undefined,
      watchExecutionAuthority: () => ({ signal: new AbortController().signal, dispose: () => {},
        authorityUnavailable: false, abortReason: null }),
    }))
    vi.doMock('@anthropic-ai/sdk', () => ({ default: class { messages = {
      create: async () => ({ content: [{ type: 'text', text: 'OK' }], usage: { input_tokens: 3, output_tokens: 1 } }),
    } } }))
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const { getAnthropic, estimateAnthropicSek } = await import('@/lib/ai/anthropic')
    const params = { model: 'claude-sonnet-4-6', max_tokens: 1200, messages: [{ role: 'user' as const, content: 'x' }] }
    const raw = await estimateAnthropicSek(params, PROD_RATES)
    await getAnthropic({ project: { projectId: 'proj-1' }, execution: TEST_AUTONOMOUS_GLOBAL }).messages.create(params)
    const reserved = reserveSpend.mock.calls[0][0].estimatedSek
    expect(reserved).toBe(ceilToLedgerScale(raw))
    expect(reserved).toBeGreaterThanOrEqual(raw)
    expect(decimals(reserved)).toBeLessThanOrEqual(SEK_LEDGER_SCALE)
  })

  it('advisory override: the accounting-only reservation and the record carry the SAME quantized amount', async () => {
    reserveSpend.mockResolvedValue({ allowed: true, wouldAllow: false, advisoryOverride: true, reason: 'budget_exceeded',
      reservationId: 'res-refused', budgetSek: 1, committedSek: 1, reservedSek: 0, headroomSek: 0, bindingScope: 'project_daily' })
    const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
    await withGovernedSpend(governed(0.002835), async () => 'ok')
    expect(reserveSpend.mock.calls[0][0].estimatedSek).toBe(0.0029)
    expect(recordAdvisoryOverride.mock.calls[0][0].estimatedSek).toBe(0.0029)
    expect(openOverrideReservation.mock.calls[0][0].estimatedSek).toBe(0.0029)
  })

  it('metered REAL cost is not inflated: a lower real cost settles at its own figure', async () => {
    const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
    const { logLlmCost } = await import('@/lib/cost/track')
    await withGovernedSpend({ ...governed(0.002835), provider: 'anthropic' }, async () => {
      await logLlmCost('claude-sonnet-4-6', { tokensIn: 1, tokensOut: 1 }, { projectId: 'proj-1' })
      return 'ok'
    })
    const [, settlement] = settleSpend.mock.calls[0]
    expect(settlement.kind).toBe('metered')
    const realSek = settlement.rows[0].cost_sek
    expect(realSek).toBeLessThan(0.0029)                            // the real figure, below the reservation
    expect(realSek).not.toBe(0.0029)
  })

  it('there is exactly ONE quantization point: no provider adapter rounds its own ceiling', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const strip = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
    expect(strip('lib/cost/governed-spend.ts').match(/ceilToLedgerScale\(/g)).toHaveLength(1)
    for (const adapter of ['lib/ai/anthropic.ts', 'lib/ai/openai-client.ts', 'lib/media/elevenlabs.ts',
      'lib/media/image-client.ts', 'lib/cost/budget-gate.ts', 'app/api/chat/tts/route.ts']) {
      expect(strip(adapter)).not.toMatch(/ceilToLedgerScale/)
    }
  })
})
