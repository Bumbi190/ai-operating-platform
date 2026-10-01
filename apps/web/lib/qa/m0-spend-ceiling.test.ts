/**
 * M0 independent-review remediation — the HARD ceiling, per governed adapter.
 *
 * Invariant under test: if durable post-dispatch persistence becomes
 * unavailable, the amount that stays held is ≥ every billable outcome the
 * provider request allows. "Billable outcome" is what the ledger would record —
 * the metered quantities priced by the same price book at the same rate
 * snapshot — so each proof below drives the REAL metering path (`track.ts`
 * inside a `SpendMeter`) at the request's maximum permitted quantities and
 * compares it with the REAL estimator's ceiling.
 *
 * Requests that cannot be bounded must be refused, never reserved at a guess.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const LIVE_RATES = vi.fn()
vi.mock('@/lib/cost/rates', () => ({ getRates: () => LIVE_RATES() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: 'p' }, error: null }) }) }) }),
      insert: async () => ({ error: null }),
    }),
    rpc: async () => ({ data: null, error: null }),
  }),
}))

/** The snapshot every proof prices with: ceiling and metering share it. */
const RATES = Object.freeze({
  usd_sek: 10.5,
  elevenlabs_usd_per_1k_chars: 0.24,
  ideogram_v3_usd_per_image: 0.08,
  gpt_image_usd_per_image: 0.042,
  openai_tts_usd_per_1k_chars: 0.015,
})

beforeEach(() => {
  vi.resetModules()
  LIVE_RATES.mockResolvedValue(RATES)
})

/** Run `log` inside a fresh governed meter priced with `rates`; return the metered SEK. */
async function metered(log: () => Promise<void>, rates: Record<string, number> = RATES): Promise<number> {
  const { SpendMeter, runWithSpendMeter } = await import('@/lib/cost/spend-meter')
  const meter = new SpendMeter(rates)
  await runWithSpendMeter(meter, log)
  return meter.rows.reduce((s, r) => s + r.cost_sek, 0)
}

const WINDOW = { 'claude-sonnet-4-6': 200_000, 'claude-haiku-4-5-20251001': 200_000, 'claude-opus-4-6': 200_000,
  'gpt-4o': 128_000, 'gpt-4o-mini': 128_000 } as const

// ── Hard-bound proofs ────────────────────────────────────────────────────────

describe('hard-bound proof per governed adapter: ceiling ≥ maximal metered outcome at the same snapshot', () => {
  for (const model of ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-6'] as const) {
    it(`Anthropic ${model}: input ≤ context window, output ≤ max_tokens`, async () => {
      const { estimateAnthropicSek } = await import('@/lib/ai/anthropic')
      const { logLlmCost } = await import('@/lib/cost/track')
      const maxTokens = 4000
      const ceiling = await estimateAnthropicSek({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: 'x' }] }, RATES)
      const worst = await metered(() => logLlmCost(model, { input_tokens: WINDOW[model], output_tokens: maxTokens }))
      expect(worst).toBeGreaterThan(0)
      expect(ceiling).toBeGreaterThanOrEqual(worst - 1e-9)
    })
  }

  it('Anthropic: the bound does not depend on the prompt text at all (a heuristic undercount is impossible)', async () => {
    const { estimateAnthropicSek } = await import('@/lib/ai/anthropic')
    const tiny = await estimateAnthropicSek({ model: 'claude-sonnet-4-6', max_tokens: 100, messages: [] }, RATES)
    const huge = await estimateAnthropicSek({ model: 'claude-sonnet-4-6', max_tokens: 100,
      messages: [{ role: 'user', content: [{ type: 'document', source: {} }, { type: 'image', source: {} }, '🙂'.repeat(50_000)] }] }, RATES)
    expect(huge).toBe(tiny)
  })

  for (const [model, n, field] of [['gpt-4o', 1, 'max_tokens'], ['gpt-4o-mini', 3, 'max_completion_tokens']] as const) {
    it(`OpenAI chat ${model}: input ≤ context window, output ≤ n × ${field} (n=${n})`, async () => {
      const { estimateOpenAIChatSek } = await import('@/lib/ai/openai-client')
      const { logLlmCost } = await import('@/lib/cost/track')
      const cap = 2048
      const ceiling = await estimateOpenAIChatSek({ model, [field]: cap, n, messages: [{ role: 'user', content: 'x' }] }, RATES)
      const worst = await metered(() => logLlmCost(model, { tokensIn: WINDOW[model], tokensOut: n * cap }))
      expect(ceiling).toBeGreaterThanOrEqual(worst - 1e-9)
    })
  }

  it('OpenAI chat: max_completion_tokens takes precedence over max_tokens, as the API does', async () => {
    const { estimateOpenAIChatSek } = await import('@/lib/ai/openai-client')
    const a = await estimateOpenAIChatSek({ model: 'gpt-4o', max_completion_tokens: 5000, max_tokens: 10, messages: [] }, RATES)
    const b = await estimateOpenAIChatSek({ model: 'gpt-4o', max_completion_tokens: 5000, messages: [] }, RATES)
    expect(a).toBe(b)
  })

  for (const n of [1, 4]) {
    it(`gpt-image-1 (n=${n}): fixed units, priced exactly as the metering prices them`, async () => {
      const { estimateImageSek } = await import('@/lib/cost/budget-gate')
      const { logImageCost } = await import('@/lib/cost/track')
      const ceiling = await estimateImageSek(n, 'gpt_image', RATES)
      const worst = await metered(() => logImageCost(n, 'openai'))
      expect(ceiling).toBeCloseTo(worst, 4)
      expect(ceiling).toBeGreaterThanOrEqual(worst - 1e-4)
    })
  }

  it('Ideogram: one image per request, ceiling = metering', async () => {
    const { estimateImageSek } = await import('@/lib/cost/budget-gate')
    const { logImageCost } = await import('@/lib/cost/track')
    const ceiling = await estimateImageSek(1, 'ideogram', RATES)
    expect(ceiling).toBeGreaterThanOrEqual(await metered(() => logImageCost(1, 'ideogram')) - 1e-4)
  })

  for (const chars of [1, 999, 4096, 25_000]) {
    it(`ElevenLabs (${chars} chars): ceiling = metering for the same character count`, async () => {
      const { estimateVoiceSek } = await import('@/lib/cost/budget-gate')
      const { logVoiceCost } = await import('@/lib/cost/track')
      const ceiling = await estimateVoiceSek(chars, RATES)
      expect(ceiling).toBeGreaterThanOrEqual(await metered(() => logVoiceCost(chars)) - 1e-4)
    })
  }

  it('OpenAI speech and MuAPI are never metered: they settle at exactly the ceiling (adapter source proof)', () => {
    const code = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')
    const openai = code('lib/ai/openai-client.ts')
    const speech = openai.slice(openai.indexOf('export async function openAISpeech('))
    expect(speech).not.toMatch(/\blog(Llm|Image|Voice)Cost\(/)
    const muapi = code('lib/media/dispatch/governed-dispatch.ts')
    expect(muapi).not.toMatch(/\blog(Llm|Image|Voice)Cost\(/)
  })
})

// ── Refusals ─────────────────────────────────────────────────────────────────

describe('a request that cannot be bounded is REFUSED, never reserved at a guess', () => {
  const anthropicCases: Array<[string, Record<string, unknown>, Record<string, unknown>?]> = [
    ['an unpriced model', { model: 'claude-sonnet-5', max_tokens: 10, messages: [] }],
    ['no output cap', { model: 'claude-sonnet-4-6', messages: [] }],
    ['cache_control (cache writes bill above input)', { model: 'claude-sonnet-4-6', max_tokens: 10,
      system: [{ type: 'text', text: 's', cache_control: { type: 'ephemeral' } }], messages: [] }],
    ['a server tool (bills per use)', { model: 'claude-sonnet-4-6', max_tokens: 10, messages: [],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }] }],
    ['MCP servers', { model: 'claude-sonnet-4-6', max_tokens: 10, messages: [], mcp_servers: [] }],
    ['a beta header', { model: 'claude-sonnet-4-6', max_tokens: 10, messages: [] }, { headers: { 'anthropic-beta': 'context-1m-2025-08-07' } }],
  ]
  for (const [name, params, options] of anthropicCases) {
    it(`Anthropic: ${name}`, async () => {
      const { estimateAnthropicSek } = await import('@/lib/ai/anthropic')
      await expect(estimateAnthropicSek(params as never, RATES, options as never)).rejects.toMatchObject({ reason: 'unbounded_spend' })
    })
  }

  it('Anthropic: a custom (client) tool is boundable — its schema is input tokens', async () => {
    const { estimateAnthropicSek } = await import('@/lib/ai/anthropic')
    await expect(estimateAnthropicSek({ model: 'claude-sonnet-4-6', max_tokens: 10, messages: [],
      tools: [{ name: 't', input_schema: {} }] }, RATES)).resolves.toBeGreaterThan(0)
  })

  const openaiCases: Array<[string, Record<string, unknown>]> = [
    ['no max_tokens / max_completion_tokens', { model: 'gpt-4o', messages: [] }],
    ['an unpriced model', { model: 'gpt-5-turbo', max_tokens: 10, messages: [] }],
    ['audio output', { model: 'gpt-4o', max_tokens: 10, messages: [], modalities: ['text', 'audio'] }],
    ['predicted outputs', { model: 'gpt-4o', max_tokens: 10, messages: [], prediction: { type: 'content', content: 'x' } }],
    ['a non-function tool', { model: 'gpt-4o', max_tokens: 10, messages: [], tools: [{ type: 'web_search' }] }],
    ['web search options', { model: 'gpt-4o', max_tokens: 10, messages: [], web_search_options: {} }],
    ['audio input', { model: 'gpt-4o', max_tokens: 10, messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: {} }] }] }],
    ['a non-integer n', { model: 'gpt-4o', max_tokens: 10, n: 0, messages: [] }],
  ]
  for (const [name, params] of openaiCases) {
    it(`OpenAI chat: ${name}`, async () => {
      const { estimateOpenAIChatSek } = await import('@/lib/ai/openai-client')
      await expect(estimateOpenAIChatSek(params as never, RATES)).rejects.toMatchObject({ reason: 'unbounded_spend' })
    })
  }

  it('a missing usd_sek refuses rather than defaulting', async () => {
    const { estimateAnthropicSek } = await import('@/lib/ai/anthropic')
    await expect(estimateAnthropicSek({ model: 'claude-sonnet-4-6', max_tokens: 10, messages: [] }, {}))
      .rejects.toMatchObject({ reason: 'unbounded_spend' })
  })
})

// ── FX / rate pinning ────────────────────────────────────────────────────────

describe('the rate snapshot is pinned: a rate edit mid-flight cannot lift metering above the ceiling', () => {
  it('metering inside a governed meter prices with the meter\'s snapshot, not today\'s rates', async () => {
    LIVE_RATES.mockResolvedValue({ ...RATES, usd_sek: 99, ideogram_v3_usd_per_image: 9 })   // edited after the reservation
    const { logImageCost, logLlmCost } = await import('@/lib/cost/track')
    const { estimateImageSek } = await import('@/lib/cost/budget-gate')
    const pinnedCeiling = await estimateImageSek(1, 'ideogram', RATES)
    expect(await metered(() => logImageCost(1, 'ideogram'), RATES)).toBeCloseTo(pinnedCeiling, 4)
    const llm = await metered(() => logLlmCost('claude-sonnet-4-6', { tokensIn: 1_000_000, tokensOut: 0 }), RATES)
    expect(llm).toBeCloseTo(3 * 10.5, 4)                         // $3 at the PINNED 10.5, not 99
  })
})

// ── Structural guards ────────────────────────────────────────────────────────

const ROOT = process.cwd()
function sources(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap(name => {
    const rel = `${dir}/${name}`
    if (statSync(join(ROOT, rel)).isDirectory()) return name === 'qa' ? [] : sources(rel)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : []
  })
}

describe('M0 ceiling guards', () => {
  const all = [...sources('lib'), ...sources('app')]

  it('every runtime withGovernedSpend call declares a ceiling basis', () => {
    for (const f of all) {
      const src = readFileSync(join(ROOT, f), 'utf8')
      const calls = src.split('withGovernedSpend(').slice(1)
      if (f === 'lib/cost/governed-spend.ts') continue
      for (const tail of calls) expect(tail.slice(0, 900), f).toMatch(/ceilingBasis: '(token_window|fixed_units|internal_fixed)'/)
    }
  })

  it("'internal_fixed' (no provider metered) is used only by the workflow effect boundaries", () => {
    const users = all.filter(f => f !== 'lib/cost/spend-ceiling.ts' && f !== 'lib/cost/governed-spend.ts'
      && /ceilingBasis: 'internal_fixed'/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(users.sort()).toEqual(['lib/workflows/effect/effect-execution.ts', 'lib/workflows/effect/proof-handler.ts'])
  })

  it('no chars-per-token heuristic survives in a governed estimator', () => {
    for (const f of ['lib/ai/anthropic.ts', 'lib/ai/openai-client.ts']) {
      expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/CHARS_PER_TOKEN/)
    }
  })
})

// ── Survival burn ────────────────────────────────────────────────────────────

describe('Survival burn includes possibly-billed spend that is not yet a cost row', () => {
  function fakeDb(costRows: number[], pendingCeilings: number[]) {
    const chain = (data: unknown) => {
      const c: any = { data, error: null }
      for (const m of ['select', 'eq', 'not', 'in', 'gte', 'order', 'limit', 'maybeSingle']) c[m] = () => c
      c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(r)
      return c
    }
    return {
      rpc: async () => ({ data: [], error: null }),
      from: (table: string) => chain(
        table === 'cost_events' ? costRows.map(cost_sek => ({ cost_sek }))
        : table === 'spend_reservations' ? pendingCeilings.map(estimated_sek => ({ estimated_sek }))
        : table === 'platform_config' ? { automation_paused: false }
        : []),
    }
  }

  it('an open reservation with dispatch intent adds its ceiling to burn until settled', async () => {
    const { readSurvivalSnapshot } = await import('@/lib/atlas/survival/snapshot')
    const opts = { funding: { state: 'UNDECLARED' } as never, testRunwayCoverage: 'PLATFORM_COMPLETE' as never }
    const without = await readSurvivalSnapshot(['p'], { ...opts, db: fakeDb([30], []) })
    const withPending = await readSurvivalSnapshot(['p'], { ...opts, db: fakeDb([30], [60]) })
    expect(without.snapshot.burnSekPerDay).toBeCloseTo(30 / 30, 6)
    expect(withPending.snapshot.burnSekPerDay).toBeCloseTo(90 / 30, 6)
  })
})
