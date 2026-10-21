import 'server-only'

/** Temporary operator-selected profile. No provider fallback and no stored-agent rewrite. */
export function atlasModelPolicy() {
  const profile = process.env.ATLAS_MODEL_PROFILE?.trim() || 'standard'
  if (profile !== 'standard' && profile !== 'openai_economy') throw new Error('INVALID_ATLAS_MODEL_PROFILE')
  return {
    profile,
    chatModel: profile === 'openai_economy' ? 'gpt-5.4-mini' : 'claude-sonnet-4-6',
    buildModel: profile === 'openai_economy' ? 'gpt-5.4-mini' : null,
    localAvailable: false,
  } as const
}
export type AtlasModelPolicy = ReturnType<typeof atlasModelPolicy>

/** GPT-5.4 accepts the completion cap, which includes reasoning. Economy mode disables reasoning. */
export function openAITextOptions(model:string, maxTokens:number, temperature:number) {
  return model === 'gpt-5.4-mini'
    ? {max_completion_tokens:maxTokens, reasoning_effort:'none' as const}
    : {max_tokens:maxTokens, temperature}
}
