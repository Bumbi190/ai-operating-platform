import {describe, expect, it} from 'vitest'
import {
  normalizeAvailabilityReview, validAvailabilityModelId,
} from '@/lib/ai/model-control/availability-review'

const MODEL='amazon.nova-micro-v1:0'
const allGreen={
  modelId:MODEL, authorizationStatus:'AUTHORIZED',
  entitlementAvailability:'AVAILABLE', regionAvailability:'AVAILABLE',
  agreementAvailability:{status:'AVAILABLE'},
}

describe('Bedrock Preview access review: metadata never enables model execution',()=>{
  it('accepts only conservative foundation model IDs (not profile IDs or ARNs)',()=>{
    expect(validAvailabilityModelId(MODEL)).toBe(true)
    expect(validAvailabilityModelId('anthropic.claude-sonnet-4-6')).toBe(true)
    for(const id of ['',{},'global','arn:aws:bedrock:::foundation-model/'+MODEL,
      'global/amazon.nova-micro-v1:0', 'bad.model with space',
      'amazon.nova.<>', 'a'.repeat(141)]) {
      expect(validAvailabilityModelId(id)).toBe(false)
    }
  })
  it('even fully available controls are for catalog role only',()=>{
    const result=normalizeAvailabilityReview(MODEL, allGreen)
    expect(result.accessForCatalogRole).toBe('reported_available')
    expect(result).toMatchObject({
      productionInvocationVerified:false,profileRoutingVerified:false,
      pricingVerified:false,regionProcessingApproved:false,budgetReserved:false,
      canDispatch:false,modelCallsMade:false,
    })
  })
  it('missing or pending agreement is not automatically approved',()=>{
    const missing=normalizeAvailabilityReview(MODEL,{...allGreen,agreementAvailability:undefined})
    const pending=normalizeAvailabilityReview(MODEL,{
      ...allGreen,agreementAvailability:{status:'PENDING'},
    })
    expect(missing.accessForCatalogRole).toBe('needs_review')
    expect(pending.accessForCatalogRole).toBe('needs_review')
    expect(pending.agreement).toBe('pending')
    expect(pending.canDispatch).toBe(false)
  })
  it('explicit denial, error or unavailable region is blocked',()=>{
    for(const response of [
      {...allGreen,authorizationStatus:'NOT_AUTHORIZED'},
      {...allGreen,entitlementAvailability:'NOT_AVAILABLE'},
      {...allGreen,agreementAvailability:{status:'ERROR'}},
      {...allGreen,regionAvailability:'NOT_AVAILABLE'},
    ]) {
      expect(normalizeAvailabilityReview(MODEL,response).accessForCatalogRole)
        .toBe('not_available')
    }
  })
  it('accepts ONLY observed Nova Micro family metadata, but never clears version approval',()=>{
    const x=normalizeAvailabilityReview(MODEL,{
      ...allGreen,modelId:'amazon.nova-micro-v1',
    })
    expect(x).toMatchObject({
      modelId:MODEL,responseIdentityScope:'unversioned_family',
      exactModelIdentityVerified:false,accessForCatalogRole:'needs_review',
      productionInvocationVerified:false,pricingVerified:false,
      canDispatch:false,modelCallsMade:false,
    })
    expect(x.authorization).toBe('authorized')
  })
  it('cannot generalize version stripping to variants or other model families',()=>{
    for (const [requested,returned] of [
      ['amazon.nova-micro-v1:0:128k','amazon.nova-micro-v1'],
      ['amazon.nova-micro-v1:0:24k','amazon.nova-micro-v1'],
      ['amazon.nova-lite-v1:0','amazon.nova-lite-v1'],
      ['amazon.nova-micro-v1:0','amazon.nova-pro-v1'],
      ['anthropic.claude-haiku-4-5-20251001-v1:0','anthropic.claude-haiku-4-5-20251001-v1'],
    ]) {
      expect(()=>normalizeAvailabilityReview(requested,{...allGreen,modelId:returned}))
        .toThrow('AVAILABILITY_RESPONSE_ID_MISMATCH')
    }
  })
  it('mismatched model identity is never accepted',()=>{
    expect(()=>normalizeAvailabilityReview(MODEL,{
      ...allGreen,modelId:'amazon.other-model',
    })).toThrow('AVAILABILITY_RESPONSE_ID_MISMATCH')
  })
  it('missing AWS identity is a separate safe error, never a positive entitlement',()=>{
    expect(()=>normalizeAvailabilityReview(MODEL,{
      ...allGreen,modelId:undefined,
    })).toThrow('AVAILABILITY_RESPONSE_ID_MISSING')
  })
})
