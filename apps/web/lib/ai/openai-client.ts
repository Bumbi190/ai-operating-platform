/**
 * lib/ai/openai-client.ts — the sanctioned way to reach OpenAI.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 * OpenAI reached Omnira's bill through two ungoverned doors: `lib/ai/runner.ts`
 * held a lazily-constructed SDK client used for chat completions and gpt-image-1
 * generation, and `app/api/chat/tts/route.ts` fetched `api.openai.com` directly
 * for Atlas speech. The audit found the TTS path outside BOTH the budget gate
 * and `cost_events` — it did not appear in the ledger at all, so its spend was
 * invisible even after the fact.
 *
 * Everything here is a thin governed wrapper. Request payloads, retry behaviour,
 * models and response shapes are unchanged; only the boundary is new.
 *
 * ── ESTIMATES ───────────────────────────────────────────────────────────────
 * Chat uses the same conservative upper bound as the Anthropic adapter — real
 * input length plus the FULL `max_tokens` allowance, priced from the shared
 * `MODEL_PRICING`. Images are per-image from `cost_rates`. Speech is per
 * character from `cost_rates`, with a fallback for the rate row that does not
 * exist yet, mirroring how every other rate in `getRates()` is defaulted.
 */

import 'server-only'

import OpenAI from 'openai'

import { getModelPricing } from './pricing'
import { logImageCost, logLlmCost, type CostContext } from '@/lib/cost/track'
import { getRates } from '@/lib/cost/rates'
import { estimateImageSek } from '@/lib/cost/budget-gate'
import {
  ProviderNotDispatchedError,
  withGovernedSpend,
  type ProjectRef,
} from '@/lib/cost/governed-spend'

const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech'

/** Same pessimistic ratio as the Anthropic adapter, for the same reason. */
const CHARS_PER_TOKEN = 3

/**
 * USD per 1 000 characters of synthesised speech, when `cost_rates` has no row.
 * OpenAI bills gpt-4o-mini-tts per token of input text; $0.015 / 1k chars is a
 * deliberate over-estimate of that, which is the safe direction for a ceiling.
 */
const OPENAI_TTS_USD_PER_1K_CHARS_FALLBACK = 0.015

export interface OpenAIGovernanceContext {
  /** Required. Which budget this call is charged to. */
  project: ProjectRef
  operation: string
  agent?: string
  runId?: string | null
  scriptId?: string | null
}

function costContext(ctx: OpenAIGovernanceContext): CostContext {
  return {
    ...('projectId' in ctx.project
      ? { projectId: ctx.project.projectId }
      : { projectSlug: ctx.project.projectSlug }),
    agent: ctx.agent,
    operation: ctx.operation,
    runId: ctx.runId ?? null,
    scriptId: ctx.scriptId ?? null,
  }
}

/** One place the credential is read. */
let _openai: OpenAI | null = null
function raw(): OpenAI {
  _openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

/** Rejected before any work happened, so releasing the reservation is defensible. */
function provablyNotBilled(e: unknown): boolean {
  const status = (e as { status?: unknown })?.status ?? (e as { response?: { status?: unknown } })?.response?.status
  return status === 400 || status === 401 || status === 403 || status === 404 || status === 422
}

export async function estimateOpenAIChatSek(
  params: { model: string; max_tokens?: number | null; messages?: unknown[] },
): Promise<number> {
  const rates = await getRates()
  const pricing = getModelPricing(params.model)
  const chars = (params.messages ?? []).reduce<number>((sum, m) => {
    const c = (m as { content?: unknown })?.content
    return sum + (typeof c === 'string' ? c.length : 0)
  }, 0)
  const tokensIn = Math.ceil(chars / CHARS_PER_TOKEN)
  const tokensOut = Math.max(0, params.max_tokens ?? 0)
  const usd = (tokensIn / 1_000_000) * pricing.inputPer1M
            + (tokensOut / 1_000_000) * pricing.outputPer1M
  return usd * (rates.usd_sek ?? 10.5)
}

export async function estimateOpenAISpeechSek(charCount: number): Promise<number> {
  const rates = await getRates()
  const perK = rates.openai_tts_usd_per_1k_chars ?? OPENAI_TTS_USD_PER_1K_CHARS_FALLBACK
  return (charCount / 1000) * perK * (rates.usd_sek ?? 10.5)
}

/**
 * Governed chat completion. `stream: true` is supported; usage is not available
 * on a streamed response, so the ledger records the estimate's token shape the
 * same way the pre-existing call site did (zeros), and the reservation bounds it.
 */
export async function openAIChatCompletion(
  ctx: OpenAIGovernanceContext,
  params: OpenAI.Chat.ChatCompletionCreateParams,
): Promise<any> {
  const estimatedSek = await estimateOpenAIChatSek(params as any)
  return withGovernedSpend(
    { project: ctx.project, provider: 'openai', operation: ctx.operation, estimatedSek },
    async () => {
      try {
        return await raw().chat.completions.create(params as any)
      } catch (e) {
        if (provablyNotBilled(e)) {
          throw new ProviderNotDispatchedError('openai rejected the chat request', e)
        }
        throw e
      }
    },
  )
}

/** Governed gpt-image-1 generation. Cost is per image and known up front. */
export async function openAIImageGenerate(
  ctx: OpenAIGovernanceContext,
  params: OpenAI.Images.ImageGenerateParams,
): Promise<any> {
  const count = Math.max(1, (params as { n?: number }).n ?? 1)
  const estimatedSek = await estimateImageSek(count, 'gpt_image')
  return withGovernedSpend(
    { project: ctx.project, provider: 'openai', operation: ctx.operation, estimatedSek },
    async () => {
      let res: any
      try {
        res = await raw().images.generate(params)
      } catch (e) {
        if (provablyNotBilled(e)) {
          throw new ProviderNotDispatchedError('openai rejected the image request', e)
        }
        throw e
      }
      await logImageCost(count, 'openai', costContext(ctx))
      return res
    },
  )
}

/** Governed gpt-image-1 edit (reference-image path). */
export async function openAIImageEdit(
  ctx: OpenAIGovernanceContext,
  params: OpenAI.Images.ImageEditParams,
): Promise<any> {
  const count = Math.max(1, (params as { n?: number }).n ?? 1)
  const estimatedSek = await estimateImageSek(count, 'gpt_image')
  return withGovernedSpend(
    { project: ctx.project, provider: 'openai', operation: ctx.operation, estimatedSek },
    async () => {
      let res: any
      try {
        res = await raw().images.edit(params as any)
      } catch (e) {
        if (provablyNotBilled(e)) {
          throw new ProviderNotDispatchedError('openai rejected the image edit', e)
        }
        throw e
      }
      await logImageCost(count, 'openai', costContext(ctx))
      return res
    },
  )
}

/**
 * Governed text-to-speech. Returns the raw `Response` so the caller can stream
 * the audio bytes through untouched — the Atlas TTS route's behaviour, headers
 * and timeout are preserved exactly.
 *
 * This path previously wrote NOTHING to cost_events. It now does.
 */
export async function openAISpeech(
  ctx: OpenAIGovernanceContext,
  payload: Record<string, unknown>,
  init?: { signal?: AbortSignal },
): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  const charCount = typeof payload.input === 'string' ? payload.input.length : 0
  const estimatedSek = await estimateOpenAISpeechSek(charCount)

  return withGovernedSpend(
    { project: ctx.project, provider: 'openai', operation: ctx.operation, estimatedSek },
    async () => {
      let res: Response
      try {
        res = await fetch(OPENAI_SPEECH_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: init?.signal,
        })
      } catch (e) {
        throw new ProviderNotDispatchedError('openai speech request never reached the provider', e)
      }

      if (!res.ok) {
        // Return the failed response rather than throwing: the caller maps the
        // status to its own error envelope. A 4xx was not billed, so free the
        // headroom; a 5xx may have synthesised audio and is left settled.
        if (res.status < 500) {
          throw new ProviderNotDispatchedError(
            `openai speech refused with ${res.status}`,
            Object.assign(new Error('openai_speech_failed'), { response: res, status: res.status }),
          )
        }
        return res
      }

      await logLlmCost(
        String(payload.model ?? 'gpt-4o-mini-tts'),
        { tokensIn: 0, tokensOut: 0 },
        { ...costContext(ctx), metadata: { unit: 'characters', characters: charCount } },
      )
      return res
    },
  )
}

/** Thrown-through failure for a refused speech request, for the route to map. */
export function speechFailureResponse(e: unknown): Response | null {
  const r = (e as { response?: unknown })?.response
  return r instanceof Response ? r : null
}
