/**
 * The Prompt editorial model-choice catalog. Planning only, NEVER dispatch.
 *
 * This complements Atlas' existing advisory model router, which governs
 * desktop/code workers. Editorial tasks require source-grounded quality,
 * provider independence and separate model evaluation.
 *
 * A listed model is NOT proof of AWS account entitlement, region support,
 * validated price, EULA acceptance or IAM permission. Only Nova Micro has a
 * verified one-off STS/Bedrock Preview text smoke. No model is approved for
 * autonomous website publishing.
 */
export const EDITORIAL_MODEL_CHOICES_VERSION = 'the-prompt.editorial-models.v1' as const

export type EditorialProvider = 'aws-bedrock' | 'anthropic-api' | 'openai-api'
export type EditorialTask = 'news_scout' | 'corroboration_researcher'
  | 'longform_writer' | 'independent_fact_checker' | 'publication_controller'
export type EditorialCapability = 'classify' | 'summarize'
  | 'source_grounded_reasoning' | 'longform' | 'review'
export type EditorialModel = Readonly<{
  key: string
  displayName: string
  modelId: string
  provider: EditorialProvider
  /** Underlying model maker, distinct from the hosting AWS provider. */
  lineage: 'amazon' | 'anthropic' | 'openai'
  supportedTasks: readonly EditorialCapability[]
  /** Advisory tier, NOT a measured benchmark. */
  provisionalQualityTier: 1 | 2 | 3
  /** A role's known route does NOT establish production entitlement. */
  availability: 'preview_smoke_only' | 'existing_omnira_provider' | 'unverified'
  cost: 'priced_in_omnira' | 'unverified'
  region: 'us-east-1' | null
  textOnly: boolean
  canInvoke: false
  canPublish: false
}>

export const EDITORIAL_MODELS: readonly EditorialModel[] = Object.freeze([
  {
    key: 'bedrock-nova-micro', displayName: 'Amazon Nova Micro · Bedrock',
    modelId: 'amazon.nova-micro-v1:0', provider: 'aws-bedrock', lineage: 'amazon',
    supportedTasks: ['classify', 'summarize'],
    provisionalQualityTier: 1, availability: 'preview_smoke_only',
    cost: 'priced_in_omnira', region: 'us-east-1', textOnly: true,
    canInvoke: false, canPublish: false,
  },
  {
    key: 'bedrock-nova-lite', displayName: 'Amazon Nova Lite · Bedrock',
    modelId: 'amazon.nova-lite-v1:0', provider: 'aws-bedrock', lineage: 'amazon',
    supportedTasks: ['classify', 'summarize', 'source_grounded_reasoning'],
    provisionalQualityTier: 2, availability: 'unverified',
    cost: 'unverified', region: 'us-east-1', textOnly: false,
    canInvoke: false, canPublish: false,
  },
  {
    key: 'bedrock-nova-pro', displayName: 'Amazon Nova Pro · Bedrock',
    modelId: 'amazon.nova-pro-v1:0', provider: 'aws-bedrock', lineage: 'amazon',
    supportedTasks: ['classify', 'summarize', 'source_grounded_reasoning', 'longform', 'review'],
    provisionalQualityTier: 3, availability: 'unverified',
    cost: 'unverified', region: 'us-east-1', textOnly: false,
    canInvoke: false, canPublish: false,
  },
  {
    key: 'anthropic-sonnet-direct', displayName: 'Claude Sonnet 4.6 · befintligt Anthropic-API',
    modelId: 'claude-sonnet-4-6', provider: 'anthropic-api', lineage: 'anthropic',
    supportedTasks: ['summarize', 'source_grounded_reasoning', 'longform', 'review'],
    provisionalQualityTier: 3, availability: 'existing_omnira_provider',
    cost: 'priced_in_omnira', region: null, textOnly: true,
    canInvoke: false, canPublish: false,
  },
  {
    key: 'openai-mini-direct', displayName: 'GPT-5.4 Mini · befintligt OpenAI-API',
    modelId: 'gpt-5.4-mini', provider: 'openai-api', lineage: 'openai',
    supportedTasks: ['classify', 'summarize', 'source_grounded_reasoning', 'review'],
    provisionalQualityTier: 2, availability: 'existing_omnira_provider',
    cost: 'priced_in_omnira', region: null, textOnly: true,
    canInvoke: false, canPublish: false,
  },
])

const ROLE_REQUIREMENTS: Readonly<Record<EditorialTask, {
  task: EditorialCapability | null
  minimumQuality: 1 | 2 | 3
  recommendedKey: string | null
}>> = Object.freeze({
  news_scout: { task: 'classify', minimumQuality: 1, recommendedKey: 'bedrock-nova-micro' },
  corroboration_researcher: {
    task: 'source_grounded_reasoning', minimumQuality: 2, recommendedKey: 'bedrock-nova-lite',
  },
  longform_writer: { task: 'longform', minimumQuality: 3, recommendedKey: 'anthropic-sonnet-direct' },
  independent_fact_checker: {
    task: 'review', minimumQuality: 3, recommendedKey: 'bedrock-nova-pro',
  },
  publication_controller: { task: null, minimumQuality: 1, recommendedKey: null },
})

export type ModelChoiceResult = Readonly<{
  role: EditorialTask
  selectedKey: string | null
  selectedModel: EditorialModel | null
  advisoryStatus: 'candidate_only' | 'blocked' | 'deterministic_gate_only'
  reason: string
  independentFromWriter: boolean | null
  sourceEvidenceVerified: false
  productionEntitlementVerified: false
  dispatchAuthorized: false
  publicationAuthorized: false
}>

export function modelChoicesForRole(role: EditorialTask): readonly EditorialModel[] {
  const policy = ROLE_REQUIREMENTS[role]
  if (!policy || policy.task === null) return []
  return EDITORIAL_MODELS.filter(model =>
    model.supportedTasks.includes(policy.task!) &&
    model.provisionalQualityTier >= policy.minimumQuality)
}

export function recommendedModelForRole(role: EditorialTask): string | null {
  return ROLE_REQUIREMENTS[role]?.recommendedKey ?? null
}

/**
 * Called only with trusted/or explicitly chosen model keys. It never calls a
 * provider or grants permission. Fact-checker must have independent model
 * lineage from the writer; hosting two models on Bedrock is not independence.
 */
export function previewEditorialModelChoice(input: {
  role: EditorialTask
  key: string | null
  writerKey?: string | null
}): ModelChoiceResult {
  const base = {
    role: input.role, selectedKey: input.key, selectedModel: null,
    independentFromWriter: null, sourceEvidenceVerified: false,
    productionEntitlementVerified: false, dispatchAuthorized: false,
    publicationAuthorized: false,
  } as const
  if (input.role === 'publication_controller') {
    return { ...base, selectedKey: null, advisoryStatus: 'deterministic_gate_only',
      reason: 'publications_require_verified_approval_and_stop_not_a_model' }
  }
  const model = EDITORIAL_MODELS.find(c => c.key === input.key)
  const candidates = modelChoicesForRole(input.role)
  if (!model || !candidates.some(c => c.key === model.key)) {
    return { ...base, advisoryStatus: 'blocked', reason: 'model_not_qualified_for_role' }
  }
  let independentFromWriter: boolean | null = null
  if (input.role === 'independent_fact_checker') {
    const writer = EDITORIAL_MODELS.find(c => c.key === input.writerKey)
    if (!writer) {
      return { ...base, advisoryStatus: 'blocked', reason: 'writer_lineage_unknown' }
    }
    independentFromWriter = writer.lineage !== model.lineage
    if (!independentFromWriter) {
      return { ...base, advisoryStatus: 'blocked', reason: 'reviewer_same_model_lineage',
        independentFromWriter: false }
    }
  }
  return { ...base, selectedModel: model, advisoryStatus: 'candidate_only',
    reason: model.availability === 'unverified'
      ? 'account_access_and_pricing_unverified'
      : model.availability === 'preview_smoke_only'
        ? 'only_preview_smoke_verified'
        : 'existing_provider_not_authorized_for_new_task',
    independentFromWriter }
}
