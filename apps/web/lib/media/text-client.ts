import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from '@/lib/ai/anthropic'
import { openAIChatCompletion, type OpenAIGovernanceContext } from '@/lib/ai/openai-client'
import { openAITextOptions } from '@/lib/ai/atlas-model-policy'
import { reserveAtlasFallback, type AtlasReserveKind } from './atlas-fallback-budget'
import {
  classifyAnthropicNoGeneration, canRouteTextFailure,
  isAutomaticTextFailoverAllowed, type FailoverReason,
} from './model-failover-policy'

// Plain text only: no silent translation of tools, images or streams.
interface MediaTextRequest {
  model: string
  max_tokens: number
  temperature?: number
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}
type MediaTextContext = Omit<OpenAIGovernanceContext, 'onFlight'> & {
  /** Supplied only after database verification by the News Hunter caller. */
  verifiedProjectSlug?: string
}
type MediaTextResponse = Pick<Anthropic.Message, 'content'> & {
  stop_reason?: Anthropic.Message['stop_reason']
  /** Actual provider model; absent when the SDK did not return it. */
  model?: string
  /** Server-only tag assigned in the governed reserve branch, never by a model. */
  writer_transport?: 'governed_openai_reserve_v1'
}

/**
 * A narrow legacy The Prompt opt-in. Preserved for already reviewed operations.
 * The new task router additionally demands hard budget enforcement.
 */
function mayUseNewsAuthReserve(ctx: MediaTextContext, error: unknown): boolean {
  return process.env.MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED === 'true'
    && 'projectSlug' in ctx.project
    && ctx.project.projectSlug === 'ai-media-automation'
    && ctx.execution.context === 'AUTONOMOUS'
    && ctx.agent === 'News Hunter'
    && ctx.operation === 'Analyze News'
    && classifyAnthropicNoGeneration(error) === 'invalid_anthropic_key'
}

async function secondaryText(
  ctx: MediaTextContext, input: MediaTextRequest, reason: FailoverReason,
): Promise<MediaTextResponse> {
  // The budget applies to every reserve (including legacy media credit recovery)
  // once the operator opts into the new router. This is BEFORE OpenAI dispatch.
  if (process.env.ATLAS_TEXT_FAILOVER_ENABLED === 'true') {
    const kind: AtlasReserveKind =
      ctx.agent === 'News Hunter' && ctx.operation === 'Analyze News' ? 'news'
      : ctx.agent === 'CFO Briefing' && ctx.operation === 'Morning Briefing' ? 'briefing'
      : ctx.agent === 'Dream' && ctx.operation === 'Dream Analysis' ? 'dream'
      : 'media'
    await reserveAtlasFallback(ctx, kind, input)
  }
  // Never log credentials, provider response body, request content or account ids.
  console.warn(`[media/text] governed model reserve selected: ${reason}`)
  // The existing cost boundary checks project ownership, stops and budget before
  // an OpenAI API request. SDK retries are disabled there.
  const response = await openAIChatCompletion(ctx, {
    model: 'gpt-5.4-mini',
    ...openAITextOptions('gpt-5.4-mini', input.max_tokens, 0.7),
    messages: [
      ...(input.system ? [{ role: 'system' as const, content: input.system }] : []),
      ...input.messages,
    ],
  })
  const choice = response?.choices?.[0]
  const text = choice?.message?.content
  if (choice?.finish_reason !== 'stop' || choice?.message?.refusal
    || typeof text !== 'string' || !text.trim()) {
    throw new Error('MEDIA_TEXT_FALLBACK_INCOMPLETE')
  }
  // Carry the actual billed provider's response model (not input.model).
  // If the provider omitted it, provenance remains UNKNOWN/blocked.
  return { content: [{ type: 'text', text, citations: null }], stop_reason: 'end_turn',
    model: typeof response.model === 'string' ? response.model : undefined,
    writer_transport: 'governed_openai_reserve_v1',
  }
}

/**
 * One Anthropic attempt; optionally ONE differently governed text-only reserve
 * when the primary provably did not generate anything.
 *
 * No second call for timeout, 429/5xx, missing budget/stop, unknown dispatch,
 * invalid model input, incomplete output or unknown provider error envelopes.
 */
export function getMediaTextClient(ctx: MediaTextContext) {
  return {
    messages: {
      async create(input: MediaTextRequest): Promise<MediaTextResponse> {
        // A definitely missing key cannot dispatch; only an explicitly enabled,
        // task-allowlisted router may skip the primary in that case.
        if (isAutomaticTextFailoverAllowed(ctx) && !process.env.ANTHROPIC_API_KEY?.trim()) {
          return secondaryText(ctx, input, 'missing_anthropic_key')
        }
        try {
          return await getAnthropic(ctx).messages.create(input)
        } catch (error) {
          const reason = canRouteTextFailure(ctx, error)
          // Preserve the legacy media-pipeline credit reserve without
          // silently enabling Dream/CFO backup spending when the new flag is OFF.
          const previouslyAllowedCredit =
            classifyAnthropicNoGeneration(error) === 'anthropic_credits_unavailable'
            && ctx.agent !== 'Dream' && ctx.agent !== 'CFO Briefing'
          const previouslyAllowedKey = mayUseNewsAuthReserve(ctx, error)
          if ((!reason && !previouslyAllowedCredit && !previouslyAllowedKey) ||
            !process.env.OPENAI_API_KEY?.trim()) throw error
          return secondaryText(ctx, input, reason ??
            (previouslyAllowedCredit ? 'anthropic_credits_unavailable' : 'invalid_anthropic_key'))
        }
      },
    },
  }
}
