/**
 * Omnira-wide MODEL CONTROL PLANE (advisory only).
 *
 * The same model can be offered by several independent provider transports.
 * A listing is neither account entitlement nor a license to dispatch/bill.
 *
 * Keep this as the SINGLE source of model identity for workflow policy,
 * editorial review, Atlas and future model dashboards. New AWS foundation
 * models and inference profiles are discovered in a *separate* trusted,
 * read-only catalog process; never infer access from the public docs alone.
 *
 * This module performs NO network I/O or AI model calls.
 */
export const OMNIRA_MODEL_CATALOG_VERSION = 'omnira.model-catalog.v1' as const

export type GlobalModelCapability =
  | 'classify' | 'summarize' | 'source_grounded_reasoning'
  | 'longform' | 'review' | 'code'
  | 'vision' | 'image_generation' | 'speech_generation'
  | 'video_generation' | 'embeddings'

export const MODEL_CAPABILITIES: readonly GlobalModelCapability[] = Object.freeze([
  'classify', 'summarize', 'source_grounded_reasoning',
  'longform', 'review', 'code', 'vision',
  'image_generation', 'speech_generation', 'video_generation', 'embeddings',
])

export type GlobalModelProvider = 'aws-bedrock' | 'anthropic-api' | 'openai-api'
export type GlobalModelLineage = 'amazon' | 'anthropic' | 'openai'
export type GlobalModelSurface = 'bedrock-runtime' | 'anthropic-messages' | 'openai-chat'
export type ModelAvailability = 'preview_smoke_only' | 'existing_omnira_provider' | 'unverified'
export type ModelPriceStatus = 'priced_in_omnira' | 'unverified'

export type GlobalModelCandidate = Readonly<{
  key: string
  displayName: string
  modelId: string
  provider: GlobalModelProvider
  underlyingLineage: GlobalModelLineage
  surface: GlobalModelSurface
  capabilities: readonly GlobalModelCapability[]
  /** NOT a benchmark. Measured quality must be attested before routing. */
  provisionalQualityTier: 1 | 2 | 3
  availability: ModelAvailability
  cost: ModelPriceStatus
  region: 'us-east-1' | null
  /** Bedrock may require an inference profile rather than this base model id. */
  inferenceProfileVerified: false
  /** Verified for this account in Production, not merely Preview. */
  productionEntitlementVerified: false
  /** Never granted from catalog membership. */
  dispatchAuthorized: false
  publicationAuthorized: false
}>

export const OMNIRA_MODEL_CATALOG: readonly GlobalModelCandidate[] = Object.freeze([
  Object.freeze({
    key: 'bedrock-nova-micro', displayName: 'Amazon Nova Micro · AWS Bedrock',
    modelId: 'amazon.nova-micro-v1:0',
    provider: 'aws-bedrock', underlyingLineage: 'amazon', surface: 'bedrock-runtime',
    capabilities: ['classify', 'summarize'] as const,
    provisionalQualityTier: 1, availability: 'preview_smoke_only',
    cost: 'priced_in_omnira', region: 'us-east-1',
    inferenceProfileVerified: false, productionEntitlementVerified: false,
    dispatchAuthorized: false, publicationAuthorized: false,
  }),
  Object.freeze({
    key: 'bedrock-nova-lite', displayName: 'Amazon Nova Lite · AWS Bedrock',
    modelId: 'amazon.nova-lite-v1:0',
    provider: 'aws-bedrock', underlyingLineage: 'amazon', surface: 'bedrock-runtime',
    capabilities: ['classify', 'summarize', 'source_grounded_reasoning'] as const,
    provisionalQualityTier: 2, availability: 'unverified',
    cost: 'unverified', region: 'us-east-1',
    inferenceProfileVerified: false, productionEntitlementVerified: false,
    dispatchAuthorized: false, publicationAuthorized: false,
  }),
  Object.freeze({
    key: 'bedrock-nova-pro', displayName: 'Amazon Nova Pro · AWS Bedrock',
    modelId: 'amazon.nova-pro-v1:0',
    provider: 'aws-bedrock', underlyingLineage: 'amazon', surface: 'bedrock-runtime',
    capabilities: ['classify', 'summarize', 'source_grounded_reasoning', 'longform', 'review'] as const,
    provisionalQualityTier: 3, availability: 'unverified',
    cost: 'unverified', region: 'us-east-1',
    inferenceProfileVerified: false, productionEntitlementVerified: false,
    dispatchAuthorized: false, publicationAuthorized: false,
  }),
  Object.freeze({
    key: 'anthropic-sonnet-direct', displayName: 'Claude Sonnet 4.6 · Anthropic API',
    modelId: 'claude-sonnet-4-6',
    provider: 'anthropic-api', underlyingLineage: 'anthropic', surface: 'anthropic-messages',
    capabilities: ['summarize', 'source_grounded_reasoning', 'longform', 'review'] as const,
    provisionalQualityTier: 3, availability: 'existing_omnira_provider',
    cost: 'priced_in_omnira', region: null,
    inferenceProfileVerified: false, productionEntitlementVerified: false,
    dispatchAuthorized: false, publicationAuthorized: false,
  }),
  Object.freeze({
    key: 'openai-mini-direct', displayName: 'GPT-5.4 Mini · OpenAI API',
    modelId: 'gpt-5.4-mini',
    provider: 'openai-api', underlyingLineage: 'openai', surface: 'openai-chat',
    capabilities: ['classify', 'summarize', 'source_grounded_reasoning', 'review'] as const,
    provisionalQualityTier: 2, availability: 'existing_omnira_provider',
    cost: 'priced_in_omnira', region: null,
    inferenceProfileVerified: false, productionEntitlementVerified: false,
    dispatchAuthorized: false, publicationAuthorized: false,
  }),
])

export function getOmniraModel(key: string): GlobalModelCandidate | null {
  return OMNIRA_MODEL_CATALOG.find(m => m.key === key) ?? null
}
