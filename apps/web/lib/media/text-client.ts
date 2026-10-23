import 'server-only'

import type Anthropic from '@anthropic-ai/sdk'
import { getAnthropic } from '@/lib/ai/anthropic'
import { openAIChatCompletion, type OpenAIGovernanceContext } from '@/lib/ai/openai-client'
import { openAITextOptions } from '@/lib/ai/atlas-model-policy'

// These media callers use text only. Do not silently translate tools, images or streams.
interface MediaTextRequest {
  model: string
  max_tokens: number
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

function isAnthropicCreditRefusal(error: unknown): boolean {
  const candidate = error as {
    status?: unknown
    error?: { type?: unknown; error?: { type?: unknown; message?: unknown } }
  } | null
  const providerError = candidate?.error?.error
  return candidate?.status === 400
    && candidate.error?.type === 'error'
    && providerError?.type === 'invalid_request_error'
    && typeof providerError.message === 'string'
    && providerError.message.startsWith('Your credit balance is too low to access the Anthropic API.')
}

function isAnthropicInvalidCredential(error: unknown): boolean {
  const candidate = error as {
    status?: unknown
    error?: { type?: unknown; error?: { type?: unknown; message?: unknown } }
  } | null
  return candidate?.status === 401
    && candidate.error?.type === 'error'
    && candidate.error.error?.type === 'authentication_error'
    && candidate.error.error.message === 'invalid x-api-key'
}

function mayUseNewsAuthReserve(ctx: MediaTextContext, error: unknown): boolean {
  return process.env.MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED === 'true'
    && 'projectSlug' in ctx.project
    && ctx.project.projectSlug === 'ai-media-automation'
    && ctx.execution.context === 'AUTONOMOUS'
    && ctx.agent === 'News Hunter'
    && ctx.operation === 'Analyze News'
    && isAnthropicInvalidCredential(error)
}

/**
 * Recover a proven unbilled Anthropic credit refusal or an explicitly
 * enabled The Prompt News Hunter-only invalid-credential refusal.
 * Keep the caller's project, authority and governed spend boundary.
 * Never retry ambiguous transport, governance or other provider failures.
 */
type MediaTextContext = Omit<OpenAIGovernanceContext, 'onFlight'>

export function getMediaTextClient(ctx: MediaTextContext) {
  const primary = getAnthropic(ctx)
  return {
    messages: {
      async create(input: MediaTextRequest): Promise<Pick<Anthropic.Message, 'content'>> {
        try {
          return await primary.messages.create(input)
        } catch (error) {
          const creditsUnavailable = isAnthropicCreditRefusal(error)
          const permittedAuthReserve = mayUseNewsAuthReserve(ctx, error)
          if ((!creditsUnavailable && !permittedAuthReserve) || !process.env.OPENAI_API_KEY) throw error

          console.warn(creditsUnavailable
            ? '[media/text] Anthropic credits unavailable; using governed OpenAI reserve'
            : '[media/text] The Prompt News Hunter API credential rejected; opted-in governed OpenAI reserve')
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
          return { content: [{ type: 'text', text, citations: null }] }
        }
      },
    },
  }
}
