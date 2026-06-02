/**
 * cost/track.ts — Cost Intelligence logging.
 *
 * The single choke point for recording every billable API call into the
 * `cost_events` table. That table is the granular source of truth behind the
 * Cost Intelligence Center (today/week/month KPIs, cost-per-project,
 * cost-per-agent, live cost stream, AI-CFO insights).
 *
 * Design rules:
 *   - NEVER throws and NEVER blocks the pipeline. Logging a cost is best-effort;
 *     if it fails we console.warn and move on.
 *   - LLM token prices come from lib/ai/pricing.ts (MODEL_PRICING). Per-unit
 *     prices for voice/images + the USD→SEK rate come from the `cost_rates`
 *     table so they can be tuned without a deploy.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { calculateCost, getModelPricing } from '@/lib/ai/pricing'

const DEFAULT_MEDIA_SLUG = 'ai-media-automation'

// ── Rate cache (5 min TTL) ──────────────────────────────────────────────────
let ratesCache: { at: number; rates: Record<string, number> } | null = null
const RATES_TTL_MS = 5 * 60 * 1000

async function getRates(): Promise<Record<string, number>> {
  if (ratesCache && Date.now() - ratesCache.at < RATES_TTL_MS) return ratesCache.rates
  const fallback = {
    usd_sek: 10.5,
    elevenlabs_usd_per_1k_chars: 0.24,
    ideogram_v3_usd_per_image: 0.08,
    gpt_image_usd_per_image: 0.042,
  }
  try {
    const db = createAdminClient()
    const { data } = await db.from('cost_rates').select('key, value')
    const rates: Record<string, number> = { ...fallback }
    for (const row of data ?? []) rates[row.key as string] = Number(row.value)
    ratesCache = { at: Date.now(), rates }
    return rates
  } catch {
    return fallback
  }
}

// ── Project slug → id cache ─────────────────────────────────────────────────
const projectIdCache = new Map<string, string | null>()

async function resolveProjectId(ctx: CostContext): Promise<string | null> {
  if (ctx.projectId !== undefined) return ctx.projectId
  const slug = ctx.projectSlug ?? DEFAULT_MEDIA_SLUG
  if (projectIdCache.has(slug)) return projectIdCache.get(slug) ?? null
  try {
    const db = createAdminClient()
    const { data } = await db.from('projects').select('id').eq('slug', slug).limit(1).maybeSingle()
    const id = data?.id ?? null
    projectIdCache.set(slug, id)
    return id
  } catch {
    return null
  }
}

// ── Types ───────────────────────────────────────────────────────────────────
export interface CostContext {
  /** Explicit project UUID (wins over slug). Pass null for platform-global. */
  projectId?: string | null
  /** Project slug to resolve; defaults to 'ai-media-automation'. */
  projectSlug?: string
  /** Which agent/role triggered the spend, e.g. 'Script Writer'. */
  agent?: string
  /** What happened, e.g. 'Generate Script'. */
  operation?: string
  runId?: string | null
  scriptId?: string | null
  metadata?: Record<string, unknown>
}

interface CostRow {
  provider: string
  model?: string | null
  unitType: 'tokens' | 'characters' | 'images' | 'seconds' | 'requests'
  units: number
  tokensIn?: number
  tokensOut?: number
  costUsd: number
}

// ── Core insert (never throws) ──────────────────────────────────────────────
async function insertCostEvent(row: CostRow, ctx: CostContext): Promise<void> {
  try {
    const [rates, projectId] = await Promise.all([getRates(), resolveProjectId(ctx)])
    const costSek = row.costUsd * (rates.usd_sek ?? 10.5)
    const db = createAdminClient()
    await db.from('cost_events').insert({
      project_id: projectId,
      provider:   row.provider,
      model:      row.model ?? null,
      agent:      ctx.agent ?? null,
      operation:  ctx.operation ?? null,
      unit_type:  row.unitType,
      units:      row.units,
      tokens_in:  row.tokensIn ?? 0,
      tokens_out: row.tokensOut ?? 0,
      cost_usd:   Number(row.costUsd.toFixed(6)),
      cost_sek:   Number(costSek.toFixed(4)),
      run_id:     ctx.runId ?? null,
      script_id:  ctx.scriptId ?? null,
      metadata:   ctx.metadata ?? {},
    })
  } catch (err) {
    console.warn('[cost] Kunde inte logga kostnad:', err instanceof Error ? err.message : err)
  }
}

// ── LLM usage (Claude / OpenAI text) ────────────────────────────────────────
export async function logLlmCost(
  model: string,
  usage: { tokensIn: number; tokensOut: number } | { input_tokens: number; output_tokens: number },
  ctx: CostContext = {},
): Promise<void> {
  const tokensIn  = 'tokensIn'  in usage ? usage.tokensIn  : usage.input_tokens
  const tokensOut = 'tokensOut' in usage ? usage.tokensOut : usage.output_tokens
  const costUsd = calculateCost(model, tokensIn, tokensOut)
  await insertCostEvent(
    {
      provider:  getModelPricing(model).provider,
      model,
      unitType:  'tokens',
      units:     tokensIn + tokensOut,
      tokensIn,
      tokensOut,
      costUsd,
    },
    ctx,
  )
}

// ── Voice (ElevenLabs) ──────────────────────────────────────────────────────
export async function logVoiceCost(charCount: number, ctx: CostContext = {}): Promise<void> {
  const rates = await getRates()
  const costUsd = (charCount / 1000) * (rates.elevenlabs_usd_per_1k_chars ?? 0.24)
  await insertCostEvent(
    { provider: 'elevenlabs', model: 'tts', unitType: 'characters', units: charCount, costUsd },
    { agent: 'Voice Director', operation: 'Generate Voiceover', ...ctx },
  )
}

// ── Images (Ideogram / gpt-image-1) ─────────────────────────────────────────
export async function logImageCost(
  count: number,
  provider: 'ideogram' | 'openai',
  ctx: CostContext = {},
): Promise<void> {
  if (count <= 0) return
  const rates = await getRates()
  const perImage = provider === 'ideogram'
    ? (rates.ideogram_v3_usd_per_image ?? 0.08)
    : (rates.gpt_image_usd_per_image ?? 0.042)
  await insertCostEvent(
    {
      provider,
      model:    provider === 'ideogram' ? 'ideogram-v3' : 'gpt-image-1',
      unitType: 'images',
      units:    count,
      costUsd:  perImage * count,
    },
    { agent: 'Image Director', operation: 'Generate Image', ...ctx },
  )
}
