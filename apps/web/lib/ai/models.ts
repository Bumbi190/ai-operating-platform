// Supported models and their display names
export const MODELS = {
  // Anthropic
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  // OpenAI text
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  // OpenAI image (dall-e-3 retired 2026-03-04 — använd gpt-image-1)
  'gpt-image-1': 'GPT Image 1 (bildgenerering)',
  'dall-e-2': 'DALL-E 2 (bildgenerering, äldre)',
  // OpenRouter (access any model via one API)
  'openrouter/auto': 'OpenRouter Auto',
} as const

export type ModelId = keyof typeof MODELS

export const DEFAULT_MODEL: ModelId = 'claude-sonnet-4-6'

export function isAnthropicModel(model: string): boolean {
  return model.startsWith('claude')
}

export function isOpenAIModel(model: string): boolean {
  return model.startsWith('gpt')
}

export function isImageModel(model: string): boolean {
  return model.startsWith('dall-e') || model.startsWith('gpt-image')
}

export function isOpenRouterModel(model: string): boolean {
  return model.startsWith('openrouter/')
}
