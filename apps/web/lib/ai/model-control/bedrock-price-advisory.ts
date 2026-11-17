/**
 * Bedrock indicative reference prices only. NEVER use this source for
 * withGovernedSpend, dispatch, price verification or credit netting.
 *
 * A reference quote cannot account for multimodal input, cache, tiers,
 * cross-Region routing, AWS account-specific terms, or FX / credits.
 * The authoritative gross hard ceiling remains in lib/cost/spend-ceiling.ts.
 */
export const BEDROCK_PRICE_ADVISORY_VERSION = 'omnira.bedrock-price-advisory.v1' as const

export type BedrockReferencePrice = Readonly<{
  modelId: string
  modelName: string
  sourceRegion: 'us-east-1'
  path: 'in_region'
  tier: 'standard'
  modality: 'text_only'
  inputUsdPerMillion: number
  outputUsdPerMillion: number
  observedOn: string
  sourceUrl: string
  sourceKind: 'third_party_tracking_aws_prices'
  lifecycleWarning: 'legacy_do_not_adopt' | 'not_independently_attested'
  /** This is NOT a snapshot proven to match current account billable rates. */
  accountRateVerified: false
  canonicalLedgerSynchronized: false
  canDispatch: false
}>

/**
 * Dated observations of us-east-1 Standard in-region text-token prices.
 * The source sites track AWS published price lists, but the individual
 * price SKU/currency/route has NOT been checked live in this account.
 * These figures must NOT be used as hard-ceiling data.
 */
export const BEDROCK_INDICATIVE_REFERENCE_PRICES: readonly BedrockReferencePrice[] =
  Object.freeze([
    Object.freeze({
      modelId: 'amazon.nova-micro-v1:0', modelName: 'Nova Micro',
      sourceRegion: 'us-east-1', path: 'in_region', tier: 'standard',
      modality: 'text_only', inputUsdPerMillion: 0.035,
      outputUsdPerMillion: 0.14, observedOn: '2026-10-20',
      sourceUrl: 'https://www.modeleol.com/pricing/amazon',
      sourceKind: 'third_party_tracking_aws_prices',
      lifecycleWarning: 'not_independently_attested',
      accountRateVerified: false, canonicalLedgerSynchronized: false,
      canDispatch: false,
    }),
    Object.freeze({
      modelId: 'amazon.nova-lite-v1:0', modelName: 'Nova Lite',
      sourceRegion: 'us-east-1', path: 'in_region', tier: 'standard',
      modality: 'text_only', inputUsdPerMillion: 0.06,
      outputUsdPerMillion: 0.24, observedOn: '2026-10-20',
      sourceUrl: 'https://www.modeleol.com/pricing/amazon',
      sourceKind: 'third_party_tracking_aws_prices',
      lifecycleWarning: 'not_independently_attested',
      accountRateVerified: false, canonicalLedgerSynchronized: false,
      canDispatch: false,
    }),
    Object.freeze({
      modelId: 'amazon.nova-pro-v1:0', modelName: 'Nova Pro',
      sourceRegion: 'us-east-1', path: 'in_region', tier: 'standard',
      modality: 'text_only', inputUsdPerMillion: 0.8,
      outputUsdPerMillion: 3.2, observedOn: '2026-10-20',
      sourceUrl: 'https://www.modeleol.com/pricing/amazon',
      sourceKind: 'third_party_tracking_aws_prices',
      lifecycleWarning: 'not_independently_attested',
      accountRateVerified: false, canonicalLedgerSynchronized: false,
      canDispatch: false,
    }),
    Object.freeze({
      modelId: 'amazon.nova-premier-v1:0', modelName: 'Nova Premier (Legacy)',
      sourceRegion: 'us-east-1', path: 'in_region', tier: 'standard',
      modality: 'text_only', inputUsdPerMillion: 2.5,
      outputUsdPerMillion: 12.5, observedOn: '2026-10-31',
      sourceUrl: 'https://instances.usage.ai/ai/nova-premier',
      sourceKind: 'third_party_tracking_aws_prices',
      // AWS official model card reports Legacy, EOL 2026-09-14.
      lifecycleWarning: 'legacy_do_not_adopt',
      accountRateVerified: false, canonicalLedgerSynchronized: false,
      canDispatch: false,
    }),
  ])

export type BedrockReferenceQuote = Readonly<{
  version: typeof BEDROCK_PRICE_ADVISORY_VERSION
  status: 'indicative_only' | 'unpriced'
  modelId: string | null
  sourceRegion: string | null
  invocationPath: string | null
  grossUsd: number | null
  inputUsdPerMillion: number | null
  outputUsdPerMillion: number | null
  priceObservedOn: string | null
  sourceUrl: string | null
  lifecycleWarning: BedrockReferencePrice['lifecycleWarning'] | null
  blockers: readonly string[]
  /** No AWS credit can ever subtract from a pre-dispatch gross estimate. */
  creditDeductionUsd: 0
  hasHardCeiling: false
  liveAccountPriceVerified: false
  fxRatePinned: false
  canonicalBudgetReserved: false
  canDispatch: false
  modelCallsMade: false
}>

export function estimateBedrockReferenceCost(input: unknown): BedrockReferenceQuote {
  const item = (input !== null && typeof input === 'object' && !Array.isArray(input))
    ? input as Record<string, unknown> : {}
  const modelId = typeof item.modelId === 'string' && item.modelId.length <= 160
    ? item.modelId : null
  const region = typeof item.sourceRegion === 'string'
    ? item.sourceRegion : null
  const path = typeof item.invocationPath === 'string'
    ? item.invocationPath : null
  const validQuantity = (v: unknown): v is number =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 1_000_000
  const reasons = [
    'price_observation_not_account_verified',
    'canonical_budget_and_fx_not_reserved',
    'provider_route_and_data_policy_not_authorized',
    'account_entitlement_and_execution_authority_not_verified',
  ]
  const unitsValid = validQuantity(item.inputTokens) && validQuantity(item.outputTokens)
  if (!unitsValid) reasons.push('invalid_or_unbounded_token_quantity')
  if (item.modality !== 'text_only') reasons.push('unsupported_modality')
  if (item.tier !== 'standard') reasons.push('unverified_billing_tier')
  if (path !== 'in_region') reasons.push('unverified_inference_pricing_path')
  if (region !== 'us-east-1') reasons.push('unverified_source_region')
  if (typeof item.creditDeductionUsd !== 'undefined' && item.creditDeductionUsd !== 0) {
    reasons.push('credit_deduction_disallowed')
  }

  const price = BEDROCK_INDICATIVE_REFERENCE_PRICES.find(p =>
    p.modelId === modelId
    && p.sourceRegion === region
    && p.path === path
    && p.tier === item.tier
    && p.modality === item.modality,
  )
  if (!price) reasons.push('no_exact_reference_price')
  if (price?.lifecycleWarning === 'legacy_do_not_adopt') {
    reasons.push('model_legacy_lifecycle_hold')
  }
  const valid = Boolean(price && unitsValid && reasons.length === 4
    + (price.lifecycleWarning === 'legacy_do_not_adopt' ? 1 : 0))
  // We do not compute a deceptively small quote when any pricing dimension
  // is unverified, nor take arbitrary discount / cache / profile multipliers.
  const unpriced = !valid || item.creditDeductionUsd !== undefined && item.creditDeductionUsd !== 0
  const raw = !unpriced && price
    ? ((item.inputTokens as number) * price.inputUsdPerMillion
      + (item.outputTokens as number) * price.outputUsdPerMillion) / 1_000_000
    : null
  // Display precision only. This is NOT a spend reservation or hard limit.
  const gross = raw === null || !Number.isFinite(raw)
    ? null : Math.ceil(raw * 1e8) / 1e8
  return {
    version: BEDROCK_PRICE_ADVISORY_VERSION,
    status: unpriced ? 'unpriced' : 'indicative_only',
    modelId, sourceRegion: region, invocationPath: path,
    grossUsd: gross,
    inputUsdPerMillion: price?.inputUsdPerMillion ?? null,
    outputUsdPerMillion: price?.outputUsdPerMillion ?? null,
    priceObservedOn: price?.observedOn ?? null,
    sourceUrl: price?.sourceUrl ?? null,
    lifecycleWarning: price?.lifecycleWarning ?? null,
    blockers: [...new Set(reasons)],
    creditDeductionUsd: 0,
    hasHardCeiling: false,
    liveAccountPriceVerified: false,
    fxRatePinned: false,
    canonicalBudgetReserved: false,
    canDispatch: false,
    modelCallsMade: false,
  }
}
