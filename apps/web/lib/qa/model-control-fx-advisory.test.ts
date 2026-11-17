import {describe,expect,it} from 'vitest'
import {ceilToLedgerScale} from '@/lib/cost/spend-ceiling'
import {estimateBedrockReferenceCost} from '@/lib/ai/model-control/bedrock-price-advisory'
import {RIKSBANK_USD_SEK_REFERENCE,reviewIllustrativeBedrockFx} from '@/lib/ai/model-control/bedrock-fx-advisory'

const price=estimateBedrockReferenceCost({
  modelId:'amazon.nova-micro-v1:0',sourceRegion:'us-east-1',
  invocationPath:'in_region',tier:'standard',modality:'text_only',
  inputTokens:10000,outputTokens:2000,
})
const req=(overrides:Record<string,unknown>={})=>({
  priceQuote:price, fx:RIKSBANK_USD_SEK_REFERENCE,asOfDate:'2026-11-17',
  exampleBufferPercent:10, ...overrides,
})

describe('FX reference conversion never licenses provider spend',()=>{
  it('pins the actual observed Riksbank USD/SEK rate with its publication date',()=>{
    expect(RIKSBANK_USD_SEK_REFERENCE).toEqual({
      date:'2026-11-16',usdSek:10.07354,
      source:'riksbank-indicative',
      sourceUrl:'https://api.riksbank.se/swea/v1/Observations/Latest/sekusdpmi',
      capturedOn:'2026-11-17',
    })
  })
  it('shows a dated gross SEK reference with 10% example buffer, rounded UP',()=>{
    const r=reviewIllustrativeBedrockFx(req())
    expect(r.status).toBe('illustrative_only')
    expect(r.usdGrossReference).toBe(0.00063)
    expect(r.sekReferenceRoundedUp).toBe(0.0064)
    expect(r.sekWithExampleBufferRoundedUp).toBe(0.007)
    expect(r).toMatchObject({
      hardCeilingApproved:false,accountPriceVerified:false,
      fxForBillingVerified:false,budgetReserved:false,canDispatch:false,
      creditAppliedUsd:0,modelCallsMade:false,
    })
  })
  it('browser-only display math agrees with the server ledger rounding algorithm',()=>{
    for(const inputTokens of [0,1,2,10,100,1000,10000,100000,1000000]){
      for(const outputTokens of [0,1,2,25,200,2000,10000,1000000]){
        const priceQuote=estimateBedrockReferenceCost({
          modelId:'amazon.nova-micro-v1:0',sourceRegion:'us-east-1',
          invocationPath:'in_region',tier:'standard',modality:'text_only',
          inputTokens,outputTokens,
        })
        const r=reviewIllustrativeBedrockFx(req({priceQuote}))
        expect(r.status).toBe('illustrative_only')
        expect(r.sekReferenceRoundedUp).toBe(
          ceilToLedgerScale(priceQuote.grossUsd!*RIKSBANK_USD_SEK_REFERENCE.usdSek))
        expect(r.sekWithExampleBufferRoundedUp).toBe(
          ceilToLedgerScale(priceQuote.grossUsd!*RIKSBANK_USD_SEK_REFERENCE.usdSek*1.1))
      }
    }
  })
  it('weekends can reference a last banking-day observation, but not stale data',()=>{
    for(const asOfDate of ['2026-11-16','2026-11-17','2026-11-18','2026-11-19']){
      expect(reviewIllustrativeBedrockFx(req({asOfDate})).status)
        .toBe('illustrative_only')
    }
    for(const asOfDate of ['2026-11-15','2026-11-20','2026-12-01','2026-99-99']){
      const r=reviewIllustrativeBedrockFx(req({asOfDate}))
      expect(r.status).toBe('blocked')
      expect(r.sekReferenceRoundedUp).toBeNull()
      expect(r.canDispatch).toBe(false)
    }
  })
  it('invalid, untrusted or zero FX input refuses without fallback to 10.5',()=>{
    for(const usdSek of [0,-1,NaN,Infinity,101]){
      const r=reviewIllustrativeBedrockFx(req({
        fx:{...RIKSBANK_USD_SEK_REFERENCE,usdSek},
      }))
      expect(r.status).toBe('blocked')
      expect(r.sekReferenceRoundedUp).toBeNull()
    }
    expect(reviewIllustrativeBedrockFx(req({
      fx:{...RIKSBANK_USD_SEK_REFERENCE,sourceUrl:'https://bad.invalid'},
    })).status).toBe('blocked')
  })
  it('no caller-supplied discounts or credits may authorize a lower reservation',()=>{
    const fake={...price,creditDeductionUsd:1000}
    const r=reviewIllustrativeBedrockFx(req({priceQuote:fake}))
    expect(r.status).toBe('blocked')
    expect(r.creditAppliedUsd).toBe(0)
    expect(r.budgetReserved).toBe(false)
  })
  it('unknown price, geo/global route and unverified currency cannot convert',()=>{
    const unknown=estimateBedrockReferenceCost({
      modelId:'amazon.nova-micro-v1:0',sourceRegion:'us-east-1',
      invocationPath:'global',tier:'standard',modality:'text_only',
      inputTokens:10000,outputTokens:2000,
    })
    expect(reviewIllustrativeBedrockFx(req({priceQuote:unknown})).status)
      .toBe('blocked')
    for(const buffer of [-1,51,NaN,Infinity,1.7,null]){
      const r=reviewIllustrativeBedrockFx(req({exampleBufferPercent:buffer}))
      expect(r.status).toBe('blocked')
      expect(r.sekWithExampleBufferRoundedUp).toBeNull()
    }
  })
  it('zero usage stays zero, but no dispatch or budget release',()=>{
    const free=estimateBedrockReferenceCost({
      modelId:'amazon.nova-micro-v1:0',sourceRegion:'us-east-1',
      invocationPath:'in_region',tier:'standard',modality:'text_only',
      inputTokens:0,outputTokens:0,
    })
    const r=reviewIllustrativeBedrockFx(req({priceQuote:free}))
    expect(r.sekReferenceRoundedUp).toBe(0)
    expect(r.canDispatch).toBe(false)
    expect(r.hardCeilingApproved).toBe(false)
  })
})
