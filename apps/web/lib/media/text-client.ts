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

/**
 * Recover only the explicit, non-billed Anthropic credit refusal.
 * Both attempts keep the caller's project, execution authority and budget boundary.
 * Stops, budget refusals, transport ambiguity and other provider errors propagate.
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
          if (!isAnthropicCreditRefusal(error) || !process.env.OPENAI_API_KEY) throw error

          console.warn('[media/text] Anthropic credits unavailable; using governed OpenAI reserve')
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
