/**
 * Model pricing — cost per 1M tokens (USD)
 * Updated: 2026
 */

export interface ModelPricing {
  inputPer1M: number   // USD per 1M input tokens
  outputPer1M: number  // USD per 1M output tokens
  perImage?: number    // USD per image (for image models)
  label: string
  provider: 'anthropic' | 'openai'
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic
  'claude-opus-4-6':              { inputPer1M: 15.00, outputPer1M: 75.00, label: 'Claude Opus 4.6',    provider: 'anthropic' },
  'claude-sonnet-4-6':            { inputPer1M: 3.00,  outputPer1M: 15.00, label: 'Claude Sonnet 4.6',  provider: 'anthropic' },
  'claude-haiku-4-5':             { inputPer1M: 0.80,  outputPer1M: 4.00,  label: 'Claude Haiku 4.5',   provider: 'anthropic' },
  'claude-haiku-4-5-20251001':    { inputPer1M: 0.80,  outputPer1M: 4.00,  label: 'Claude Haiku 4.5',   provider: 'anthropic' },
  'claude-3-5-haiku-20241022':    { inputPer1M: 0.80,  outputPer1M: 4.00,  label: 'Claude Haiku 3.5',   provider: 'anthropic' },
  'claude-3-5-sonnet-20241022':   { inputPer1M: 3.00,  outputPer1M: 15.00, label: 'Claude Sonnet 3.5',  provider: 'anthropic' },
  // OpenAI text
  'gpt-4o':                       { inputPer1M: 2.50,  outputPer1M: 10.00, label: 'GPT-4o',            provider: 'openai' },
  'gpt-4o-mini':                  { inputPer1M: 0.15,  outputPer1M: 0.60,  label: 'GPT-4o Mini',       provider: 'openai' },
  // OpenAI image (dall-e-3 retired 2026-03-04)
  'gpt-image-1':                  { inputPer1M: 0, outputPer1M: 0, perImage: 0.042, label: 'GPT Image 1', provider: 'openai' },
  'dall-e-2':                     { inputPer1M: 0, outputPer1M: 0, perImage: 0.020, label: 'DALL-E 2',   provider: 'openai' },
}

export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? { inputPer1M: 3.00, outputPer1M: 15.00, label: model, provider: 'anthropic' }
}

/**
 * Calculate cost in USD for a given number of tokens
 */
export function calculateCost(model: string, tokensIn: number, tokensOut: number): number {
  const pricing = getModelPricing(model)
  return (tokensIn / 1_000_000) * pricing.inputPer1M +
         (tokensOut / 1_000_000) * pricing.outputPer1M
}

/**
 * Format USD cost as a readable string
 */
export function formatCost(usd: number): string {
  if (usd < 0.001) return '< $0.001'
  if (usd < 1) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}
