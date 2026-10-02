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
  SEK_LEDGER_MAX, SEK_LEDGER_SCALE, ceilToLedgerScale, fixedUnitCeiling, openAISpeechCeiling, tokenWindowCeiling,
  CONTEXT_WINDOW_TOKENS,
} from '@/lib/cost/spend-ceiling'
import { MODEL_PRICING, calculateCost } from '@/lib/ai/pricing'

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
const inserted: Array<{ table: string; row: Record<string, unknown> }> = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => { inserted.push({ table, row }); return { error: null } },
    }),
  }),
}))
vi.mock('@/lib/cost/rates', () => ({ getRates: async () => ({ usd_sek: 10.5 }) }))

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
/** The next 4-decimal amount below a ledger amount, computed exactly (integer quanta), not by float subtraction. */
const belowByOneQuantum = (q: number) => (Math.round(q * 10 ** SEK_LEDGER_SCALE) - 1) / 10 ** SEK_LEDGER_SCALE

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  inserted.length = 0
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
    [99999999.99985, 99999999.9999],
    [SEK_LEDGER_MAX, SEK_LEDGER_MAX],
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
      if (!(belowByOneQuantum(q) < x)) throw new Error(`not minimal: ${x} → ${q}`)
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

// ── The ledger's domain: maximum, huge and invalid inputs ────────────────────

describe('ledger maximum and huge inputs: refused, never clamped, never looping', () => {
  it('the maximum is the numeric(12,4) maximum 99 999 999.9999, itself on the ledger scale', () => {
    expect(SEK_LEDGER_MAX).toBe(99_999_999.9999)
    expect(ceilToLedgerScale(SEK_LEDGER_MAX)).toBe(SEK_LEDGER_MAX)
    expect(String(SEK_LEDGER_MAX)).toBe('99999999.9999')
  })

  it('anything above the maximum is returned UNCHANGED (for refusal), never clamped down to fit', () => {
    for (const v of [99_999_999.99995, 100_000_000, 1e12, 2 ** 53, 1e300, Number.MAX_VALUE]) {
      expect(ceilToLedgerScale(v)).toBe(v)
    }
  })

  it('huge finite values cannot hang: the k±1 === k territory returns at once', () => {
    const k = 1e300 * 10_000
    expect(k - 1).toBe(k)                                         // the progress-free case the review named
    const t0 = performance.now()
    for (let i = 0; i < 100_000; i += 1) ceilToLedgerScale(Number.MAX_VALUE / (1 + (i % 7)))
    expect(performance.now() - t0).toBeLessThan(2_000)
  })

  it('the helper is loop-free (permanent source guard)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'lib/cost/spend-ceiling.ts'), 'utf8')
    const body = src.slice(src.indexOf('export function ceilToLedgerScale'))
    expect(body.slice(0, body.indexOf('\n}\n'))).not.toMatch(/\b(while|for)\s*\(/)
  })

  it('property near the maximum: every value in [max - 1, max] lands on the scale, >= input, <= max', () => {
    let seed = 12345
    const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32 }
    for (let i = 0; i < 50_000; i += 1) {
      const x = SEK_LEDGER_MAX - rand()
      const q = ceilToLedgerScale(x)
      if (!(q >= x && q <= SEK_LEDGER_MAX && belowByOneQuantum(q) < x && decimals(q) <= SEK_LEDGER_SCALE)) {
        throw new Error(`bad quantization near max: ${x} -> ${q}`)
      }
    }
  })

  it('the maximum is accepted and reserved as-is', async () => {
    const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
    await withGovernedSpend(governed(SEK_LEDGER_MAX), async () => 'ok')
    expect(reserveSpend.mock.calls[0][0].estimatedSek).toBe(SEK_LEDGER_MAX)
  })

  it.each([99_999_999.99991, 99_999_999.99995, 100_000_000, 1e300, Number.MAX_VALUE])(
    'just-over / far-over maximum %s is REFUSED before reserveSpend and before any provider call', async (v) => {
      const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
      const provider = vi.fn()
      await expect(withGovernedSpend(governed(v), provider))
        .rejects.toMatchObject({ reason: 'invalid_estimate', message: expect.stringMatching(/exceeds the ledger maximum/) })
      expect(reserveSpend).not.toHaveBeenCalled()
      expect(openOverrideReservation).not.toHaveBeenCalled()
      expect(provider).not.toHaveBeenCalled()
    })

  it.each([-0.0001, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'non-finite / negative %s keeps the existing invalid_estimate refusal', async (v) => {
      const { withGovernedSpend } = await import('@/lib/cost/governed-spend')
      await expect(withGovernedSpend(governed(v), async () => 'ok'))
        .rejects.toMatchObject({ reason: 'invalid_estimate', message: expect.stringMatching(/not a usable amount/) })
      expect(reserveSpend).not.toHaveBeenCalled()
    })
})

// ── Metered / ungoverned authority cost: cost_events.cost_sek ────────────────

/** Run `log` inside a governed meter (the governed path); return the rows it collected. */
async function meteredRows(log: () => Promise<void>) {
  const { SpendMeter, runWithSpendMeter } = await import('@/lib/cost/spend-meter')
  const meter = new SpendMeter({ usd_sek: 10.5 })
  await runWithSpendMeter(meter, log)
  return meter.rows
}

describe('authority cost_sek is quantized UP; the metering itself stays factual', () => {
  it('the production Atlas smoke (Sonnet 104 in / 4 out): 0.003906 SEK persists as 0.0040, not 0.0039', async () => {
    const { logLlmCost } = await import('@/lib/cost/track')
    const raw = calculateCost('claude-sonnet-4-6', 104, 4) * 10.5
    expect(raw).toBeCloseTo(0.003906, 12)
    const [row] = await meteredRows(() => logLlmCost('claude-sonnet-4-6', { input_tokens: 104, output_tokens: 4 }))
    expect(row.cost_sek).toBe(0.004)
    expect(row.cost_sek).toBeGreaterThanOrEqual(raw)
    // Factual metering is untouched; the exact calculated figure is kept.
    expect(row).toMatchObject({ tokens_in: 104, tokens_out: 4, units: 108, provider: 'anthropic',
      model: 'claude-sonnet-4-6', cost_usd: 0.000372 })
    expect((row.metadata as Record<string, number>).cost_sek_calculated).toBeCloseTo(0.003906, 12)
  })

  it('a 1-token tiny positive provider cost never persists as 0.0000', async () => {
    const { logLlmCost } = await import('@/lib/cost/track')
    const [row] = await meteredRows(() => logLlmCost('claude-haiku-4-5', { input_tokens: 1, output_tokens: 0 }))
    expect(calculateCost('claude-haiku-4-5', 1, 0) * 10.5).toBeGreaterThan(0)
    expect(row.cost_sek).toBe(0.0001)
  })

  it('an already 4-decimal cost is stable and carries no extra metadata', async () => {
    const { logLlmCost } = await import('@/lib/cost/track')
    const [row] = await meteredRows(() => logLlmCost('claude-sonnet-4-6', { input_tokens: 1_000_000, output_tokens: 0 },
      { metadata: { a: 1 } }))
    expect(row.cost_sek).toBe(31.5)
    expect(row.metadata).toEqual({ a: 1 })
  })

  it('zero attribution rows stay exactly zero', async () => {
    const { logCostAttribution } = await import('@/lib/cost/track')
    await logCostAttribution('ideogram', { projectId: 'proj-1', metadata: { assetId: 'a1' } })
    expect(inserted).toHaveLength(1)
    expect(inserted[0].row).toMatchObject({ cost_sek: 0, cost_usd: 0 })
    expect(inserted[0].row.metadata).toEqual({ assetId: 'a1', attribution_only: true })
  })

  it('UNGOVERNED positive rows (budget_scope_state sums ALL cost_events) are quantized the same way', async () => {
    const { logLlmCost } = await import('@/lib/cost/track')
    await logLlmCost('claude-sonnet-4-6', { input_tokens: 104, output_tokens: 4 }, { projectId: 'proj-1' })
    expect(inserted).toHaveLength(1)                               // outside any meter: a direct insert
    expect(inserted[0]).toMatchObject({ table: 'cost_events', row: { cost_sek: 0.004 } })
  })

  it('property: every positive governed metered cost persists >= raw, minimal, <= one quantum above', async () => {
    const { logLlmCost } = await import('@/lib/cost/track')
    let seed = 777
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
    const models = Object.keys(MODEL_PRICING)
    for (let i = 0; i < 3_000; i += 1) {
      const model = models[i % models.length]
      const tin = Math.floor(rand() * 10 ** Math.floor(rand() * 7))
      const tout = Math.floor(rand() * 10 ** Math.floor(rand() * 5))
      const raw = calculateCost(model, tin, tout) * 10.5
      const [row] = await meteredRows(() => logLlmCost(model, { input_tokens: tin, output_tokens: tout }))
      if (!(row.cost_sek >= raw)) throw new Error(`under-counted ${model} ${tin}/${tout}: ${row.cost_sek} < ${raw}`)
      if (!(belowByOneQuantum(row.cost_sek) < raw)) throw new Error(`not minimal: ${row.cost_sek} vs ${raw}`)
      if (raw > 0 && row.cost_sek === 0) throw new Error('positive cost persisted as zero')
      if (decimals(row.cost_sek) > SEK_LEDGER_SCALE) throw new Error(`not on the ledger scale: ${row.cost_sek}`)
    }
  })

  it('1:N rows cannot accumulate downward rounding: each row is >= its raw, so the sum is >= the raw sum', async () => {
    const { logLlmCost } = await import('@/lib/cost/track')
    const usages = [[104, 4], [1, 0], [333, 17], [2, 2], [99_999, 1]] as const
    const rows = await meteredRows(async () => {
      for (const [i, o] of usages) await logLlmCost('claude-sonnet-4-6', { input_tokens: i, output_tokens: o })
    })
    const rawSum = usages.reduce((s, [i, o]) => s + calculateCost('claude-sonnet-4-6', i, o) * 10.5, 0)
    const nearestSum = usages.reduce((s, [i, o]) => s + Number((calculateCost('claude-sonnet-4-6', i, o) * 10.5).toFixed(4)), 0)
    const storedSum = rows.reduce((s, r) => s + r.cost_sek, 0)
    expect(nearestSum).toBeLessThan(rawSum)                        // the old rule under-counted this batch
    expect(storedSum).toBeGreaterThanOrEqual(rawSum)
    expect(storedSum - rawSum).toBeLessThan(usages.length * 0.0001)
  })
})
