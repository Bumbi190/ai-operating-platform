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
import { toJson } from '@/lib/supabase/json'

const DEFAULT_MEDIA_SLUG = 'ai-media-automation'

/**
 * Re-exported so every existing importer keeps working. The implementation
 * lives in `./rates` — see that file for why it was split out. There is still
 * exactly ONE accessor, which is what stops the estimate and the ledger drifting.
 */
export { getRates } from './rates'

import { getRates } from './rates'
import { currentSpendMeter, type MeteredCostRow } from './spend-meter'

/**
 * The rates to price a cost row with. Inside a governed call: the snapshot that
 * priced its hard ceiling (M0), so ceiling and metering can never diverge.
 * Outside: the current rates.
 */
async function ratesForCost(): Promise<Record<string, number>> {
  return currentSpendMeter()?.rates ?? await getRates()
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

// ── Core write (never throws) ───────────────────────────────────────────────
//
// INSIDE a governed call (M0) the row is handed to that call's spend meter, and
// `withGovernedSpend` writes it through `budget_settle_recorded` together with
// the settlement — so for governed spend this function is no longer the
// authority, and its failure can no longer make spend disappear.
//
// OUTSIDE any governed call the row is ungoverned telemetry and stays a
// best-effort insert, but a failure is now SEEN: supabase-js reports a failed
// insert in `{ error }` rather than throwing, and that result used to be ignored.
async function insertCostEvent(row: CostRow, ctx: CostContext): Promise<void> {
  try {
    const [rates, projectId] = await Promise.all([ratesForCost(), resolveProjectId(ctx)])
    const costSek = row.costUsd * (rates.usd_sek ?? 10.5)
    const record: MeteredCostRow = {
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
      metadata:   toJson(ctx.metadata ?? {}),
    }

    const meter = currentSpendMeter()
    if (meter) {
      if (meter.record(record)) return
      // The governed call already settled (at least its reserved hard ceiling).
      // Inserting this as well would count the same provider call twice.
      console.error('[cost] metered cost arrived after its governed settlement; NOT written to avoid '
        + 'double-counting:', { provider: record.provider, model: record.model, costSek: record.cost_sek })
      return
    }

    const db = createAdminClient()
    const { error } = await db.from('cost_events').insert(record as never)
    if (error) {
      console.error('[cost] ungoverned cost_events insert FAILED — this spend is missing from the ledger:',
        { provider: record.provider, costSek: record.cost_sek, error: error.message })
    }
  } catch (err) {
    console.error('[cost] Kunde inte logga kostnad:', err instanceof Error ? err.message : err)
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

// ── Sound generation (ElevenLabs), per second ───────────────────────────────
/**
 * The canonical per-second rate key for ElevenLabs sound generation. There is
 * deliberately NO fallback: a guessed per-second price — or a voice-character
 * proxy — is not a hard ceiling (M0), so with no configured row the governed
 * adapter refuses the call before reserving.
 */
export const ELEVENLABS_SOUND_RATE_KEY = 'elevenlabs_sound_usd_per_second'

/** Meters `seconds` of generated sound at the pinned canonical per-second rate. */
export async function logSoundCost(seconds: number, ctx: CostContext = {}): Promise<void> {
  const rates = await ratesForCost()
  const perSecond = rates[ELEVENLABS_SOUND_RATE_KEY]
  if (typeof perSecond !== 'number' || !Number.isFinite(perSecond) || perSecond < 0) {
    // Unreachable through the governed adapter (it refuses without the rate).
    // Never price a row from a guess: with nothing metered, the governed call
    // settles at its hard ceiling instead.
    console.error('[cost] no canonical sound-generation rate; nothing metered')
    return
  }
  await insertCostEvent(
    { provider: 'elevenlabs', model: 'sound-generation', unitType: 'seconds', units: seconds, costUsd: seconds * perSecond },
    { agent: 'Music Director', operation: 'Generate Background Music', ...ctx },
  )
}

// ── Voice (ElevenLabs) ──────────────────────────────────────────────────────
export async function logVoiceCost(charCount: number, ctx: CostContext = {}): Promise<void> {
  const rates = await ratesForCost()
  const costUsd = (charCount / 1000) * (rates.elevenlabs_usd_per_1k_chars ?? 0.24)
  await insertCostEvent(
    { provider: 'elevenlabs', model: 'tts', unitType: 'characters', units: charCount, costUsd },
    { agent: 'Voice Director', operation: 'Generate Voiceover', ...ctx },
  )
}

// ── Attribution only (no amount) ────────────────────────────────────────────
/**
 * Names WHICH provider call produced an artifact, without counting it again.
 *
 * The paid call was reserved and settled inside its governed adapter, and that
 * settlement is the ledger's amount. A second row carrying a price would count
 * the same call twice, so this row is deliberately zero-cost and says so.
 */
export async function logCostAttribution(
  provider: string,
  ctx: CostContext = {},
): Promise<void> {
  await insertCostEvent(
    { provider, model: null, unitType: 'requests', units: 0, costUsd: 0 },
    { ...ctx, metadata: { ...(ctx.metadata ?? {}), attribution_only: true } },
  )
}

// ── Images (Ideogram / gpt-image-1) ─────────────────────────────────────────
export async function logImageCost(
  count: number,
  provider: 'ideogram' | 'openai',
  ctx: CostContext = {},
): Promise<void> {
  if (count <= 0) return
  const rates = await ratesForCost()
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
