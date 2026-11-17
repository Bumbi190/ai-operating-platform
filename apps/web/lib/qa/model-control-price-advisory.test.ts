import {describe, expect, it} from 'vitest'
import {
  BEDROCK_INDICATIVE_REFERENCE_PRICES, estimateBedrockReferenceCost,
} from '@/lib/ai/model-control/bedrock-price-advisory'

const BASE={
  modelId:'amazon.nova-micro-v1:0',sourceRegion:'us-east-1',
  invocationPath:'in_region',tier:'standard',modality:'text_only',
  inputTokens:10_000,outputTokens:2_000,
}

describe('Bedrock indicative gross cost and credit-independent safety boundaries',()=>{
  it('has only exact sourced identity and US standard in-region text reference rates',()=>{
    expect(BEDROCK_INDICATIVE_REFERENCE_PRICES).toHaveLength(4)
    expect(new Set(BEDROCK_INDICATIVE_REFERENCE_PRICES.map(p=>p.modelId)).size).toBe(4)
    for (const p of BEDROCK_INDICATIVE_REFERENCE_PRICES) {
      expect(p.sourceRegion).toBe('us-east-1')
      expect(p.path).toBe('in_region')
      expect(p.modality).toBe('text_only')
      expect(p.tier).toBe('standard')
      expect(p.sourceKind).toBe('third_party_tracking_aws_prices')
      expect(p.sourceUrl).toMatch(/^https:\/\//)
      expect(p.accountRateVerified).toBe(false)
      expect(p.canonicalLedgerSynchronized).toBe(false)
      expect(p.canDispatch).toBe(false)
    }
  })
  it('prices a sample scenario as indicative GROSS USD only',()=>{
    const r=estimateBedrockReferenceCost(BASE)
    // 10k * 0.035/1M + 2k * 0.14/1M = 0.00063 USD.
    expect(r.grossUsd).toBe(0.00063)
    expect(r.status).toBe('indicative_only')
    expect(r.sourceUrl).toContain('modeleol.com')
    expect(r).toMatchObject({
      creditDeductionUsd:0,hasHardCeiling:false,
      liveAccountPriceVerified:false,fxRatePinned:false,
      canonicalBudgetReserved:false,canDispatch:false,modelCallsMade:false,
    })
  })
  it('comparison to Nova Lite/Pro/Premier cannot silently authorize legacy model',()=>{
    const list=[
      ['amazon.nova-lite-v1:0',0.00108],
      ['amazon.nova-pro-v1:0',0.0144],
      ['amazon.nova-premier-v1:0',0.05],
    ] as const
    for (const [modelId,price] of list) {
      const r=estimateBedrockReferenceCost({...BASE,modelId})
      expect(r.grossUsd).toBeCloseTo(price,8)
      expect(r.canDispatch).toBe(false)
    }
    const premier=estimateBedrockReferenceCost({
      ...BASE,modelId:'amazon.nova-premier-v1:0',
    })
    expect(premier.lifecycleWarning).toBe('legacy_do_not_adopt')
    expect(premier.blockers).toContain('model_legacy_lifecycle_hold')
    expect(premier.status).toBe('indicative_only')
  })
  it('never assumes geo/global inference profile has an in-region price',()=>{
    for (const invocationPath of ['geographic','global','cross-region','us.amazon.nova-premier-v1:0']) {
      const r=estimateBedrockReferenceCost({...BASE,invocationPath})
      expect(r.status).toBe('unpriced')
      expect(r.grossUsd).toBe(null)
      expect(r.blockers).toContain('unverified_inference_pricing_path')
      expect(r.canDispatch).toBe(false)
    }
  })
  it('other source regions, tiers, modalities and versions are not priced',()=>{
    for (const value of [
      {...BASE,sourceRegion:'eu-west-1'},
      {...BASE,tier:'flex'},
      {...BASE,tier:'priority'},
      {...BASE,modality:'image'},
      {...BASE,modality:'audio'},
      {...BASE,modelId:'amazon.nova-micro-v1:0:128k'},
      {...BASE,modelId:'amazon.nova-micro-v1'},
      {...BASE,modelId:'amazon.fake-model-v1:0'},
    ]) {
      const r=estimateBedrockReferenceCost(value)
      expect(r.status).toBe('unpriced')
      expect(r.grossUsd).toBe(null)
    }
  })
  it('rejects empty, invalid, huge or non-integer token inputs without a quote',()=>{
    for (const value of [
      {...BASE,inputTokens:-1}, {...BASE,outputTokens:-1},
      {...BASE,inputTokens:1.25}, {...BASE,outputTokens:1.5},
      {...BASE,inputTokens:Infinity},{...BASE,inputTokens:NaN},
      {...BASE,inputTokens:1_000_001},{...BASE,outputTokens:1_000_001},
      {...BASE,inputTokens:'10000'}, {...BASE,outputTokens:undefined},
      null, {}, [], 'anything',
    ]) {
      const r=estimateBedrockReferenceCost(value)
      expect(r.grossUsd).toBe(null)
      expect(r.status).toBe('unpriced')
      expect(r.canDispatch).toBe(false)
    }
  })
  it('credit deduction is NEVER permitted, even if account shows $1000 credit',()=>{
    const r=estimateBedrockReferenceCost({...BASE,creditDeductionUsd:1000})
    expect(r.status).toBe('unpriced')
    expect(r.grossUsd).toBe(null)
    expect(r.creditDeductionUsd).toBe(0)
    expect(r.blockers).toContain('credit_deduction_disallowed')
  })
  it('gross cost is insensitive to speculative credit balance or discount fields',()=>{
    const base=estimateBedrockReferenceCost(BASE)
    const a=estimateBedrockReferenceCost({
      ...BASE,remainingCreditsUsd:1000,discountPercent:50,
    })
    expect(base.grossUsd).toBe(a.grossUsd)
    expect(a.creditDeductionUsd).toBe(0)
    expect(a.canDispatch).toBe(false)
  })
  it('no default fallback price or self-attested verified rates',()=>{
    expect(estimateBedrockReferenceCost({
      ...BASE,modelId:'anthropic.claude-3-sonnet-v1',
      inputUsdPerMillion:0,outputUsdPerMillion:0,accountRateVerified:true,
    }).grossUsd).toBe(null)
    expect(estimateBedrockReferenceCost({
      ...BASE,inputUsdPerMillion:0,outputUsdPerMillion:0,
      accountRateVerified:true,
    }).grossUsd).toBe(0.00063)
  })
})
