import 'server-only'

import { randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRates } from '@/lib/cost/rates'
import { getModelPricing } from '@/lib/ai/pricing'
import { resolveGovernedProjectId } from '@/lib/cost/governed-spend'
import { isSpendGateEnforced } from '@/lib/cost/spend-gate-flag'
import type { OpenAIGovernanceContext } from '@/lib/ai/openai-client'

export const ATLAS_RESERVE_DAY_SEK = 10
export const ATLAS_RESERVE_MONTH_SEK = 100
export const ATLAS_RESERVE_MAX_INPUT_BYTES = 24 * 1024
export const ATLAS_RESERVE_MAX_OUTPUT_TOKENS = 4096
const FIXED_ENVELOPE_OVERHEAD_TOKENS = 8192
const PRICING_BUFFER = 2

export type AtlasReserveKind = 'news' | 'briefing' | 'dream' | 'media'
type TextCtx = Omit<OpenAIGovernanceContext, 'onFlight'>
type Prompt = { system?: string; max_tokens: number; messages: { role: string; content: string }[] }

export class AtlasReserveRefused extends Error {
  constructor(public readonly reason: string) {
    super('ATLAS_RESERVE_REFUSED')
    this.name = 'AtlasReserveRefused'
  }
}

/**
 * Upper envelope for plain text. A fixed 8192-token protocol allowance and
 * doubled *conservative* cost rates keep this deliberately above estimated bills.
 * Large/unbounded requests are rejected. This is an admission reserve, not
 * evidence of the provider's final invoice.
 */
export async function estimateAtlasReserveSek(
  input: Prompt,
  ratesProvider: () => Promise<Record<string, number>> = getRates,
): Promise<number> {
  if (!Number.isSafeInteger(input.max_tokens) || input.max_tokens < 1 ||
      input.max_tokens > ATLAS_RESERVE_MAX_OUTPUT_TOKENS ||
      (typeof input.system !== 'undefined' && typeof input.system !== 'string') ||
      !Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 30 ||
      input.messages.some(m => !m || !['user','assistant'].includes(m.role) || typeof m.content !== 'string')) {
    throw new AtlasReserveRefused('invalid_envelope')
  }
  const content = [input.system ?? '', ...input.messages.map(m => m.content)].join('')
  const bytes = Buffer.byteLength(content, 'utf8')
  if (bytes < 1 || bytes > ATLAS_RESERVE_MAX_INPUT_BYTES) {
    throw new AtlasReserveRefused('input_too_large')
  }
  const rates = await ratesProvider()
  const fx = Math.max(12, Number(rates.usd_sek))
  // The app's previous price book omitted gpt-5.4-mini and fell back to
  // Anthropic's $3/$15. Keep AT LEAST those conservative rates rather than
  // trusting a missing/cheaper catalog entry.
  const model = getModelPricing('gpt-5.4-mini')
  const inputPrice = Math.max(3, model.inputPer1M)
  const outputPrice = Math.max(15, model.outputPer1M)
  if (![fx,inputPrice,outputPrice].every(Number.isFinite)) {
    throw new AtlasReserveRefused('price_unavailable')
  }
  const envelopeUsd =
    ((bytes + FIXED_ENVELOPE_OVERHEAD_TOKENS) * inputPrice +
       input.max_tokens * outputPrice) / 1_000_000
  const estimatedSek = Math.ceil(envelopeUsd * fx * PRICING_BUFFER * 100) / 100
  if (!Number.isFinite(estimatedSek) || estimatedSek <= 0 || estimatedSek > ATLAS_RESERVE_DAY_SEK) {
    throw new AtlasReserveRefused('single_request_exceeds_day')
  }
  return estimatedSek
}

type Db = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown; error: unknown
}> }
type ReserveDependencies = {
  db: Db
  resolve: typeof resolveGovernedProjectId
  rates: typeof getRates
  requestId: () => string
}

/**
 * One atomic DB reservation shared by all projects/tasks/instances.
 * Never releases: a crash/timeout may have billed remotely, so headroom is
 * retained until the Swedish calendar period rolls over.
 */
export async function reserveAtlasFallback(
  ctx: TextCtx,
  kind: AtlasReserveKind,
  input: Prompt,
  overrides: Partial<ReserveDependencies> = {},
): Promise<void> {
  if (process.env.ATLAS_TEXT_FAILOVER_ENABLED !== 'true' ||
      !isSpendGateEnforced()) {
    throw new AtlasReserveRefused('disabled')
  }
  const deps: ReserveDependencies = {
    db: overrides.db ?? createAdminClient() as unknown as Db,
    resolve: overrides.resolve ?? resolveGovernedProjectId,
    rates: overrides.rates ?? getRates,
    requestId: overrides.requestId ?? randomUUID,
  }
  const ceiling = await estimateAtlasReserveSek(input, deps.rates)
  const project = await deps.resolve(ctx.project)
  if (!project.ok) throw new AtlasReserveRefused('project_unavailable')
  try {
    const { data, error } = await deps.db.rpc('atlas_fallback_reserve', {
      p_request_id: deps.requestId(),
      p_project_id: project.projectId,
      p_task_kind: kind,
      p_ceiling_sek: ceiling,
    })
    if (error) throw new AtlasReserveRefused('database_unavailable')
    const row = Array.isArray(data) ? data[0] : data
    if (!row || typeof row !== 'object' || (row as any).allowed !== true) {
      throw new AtlasReserveRefused(String((row as any)?.reason ?? 'unavailable'))
    }
  } catch (error) {
    if (error instanceof AtlasReserveRefused) throw error
    throw new AtlasReserveRefused('database_unavailable')
  }
}
