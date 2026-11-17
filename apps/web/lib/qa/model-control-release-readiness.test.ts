import { describe, expect, it } from 'vitest'
import {
  normalizeBedrockCatalog,
} from '@/lib/ai/model-control/discovery-normalize'
import {
  normalizeAvailabilityReview,
} from '@/lib/ai/model-control/availability-review'
import {
  reviewBedrockReleaseReadiness,
} from '@/lib/ai/model-control/model-release-readiness'

const MODEL='amazon.nova-micro-v1:0'
const VARIANT='amazon.nova-micro-v1:0:128k'
const MODEL_ARN='arn:aws:bedrock:us-east-1::foundation-model/'+MODEL
const PRO_ARN='arn:aws:bedrock:us-west-2::foundation-model/'+MODEL
const globalArn='arn:aws:bedrock:::foundation-model/'+MODEL
const models=[
  {modelId:MODEL,modelName:'Nova Micro',modelLifecycle:{status:'ACTIVE'}},
  {modelId:VARIANT,modelName:'Nova Micro extended',modelLifecycle:{status:'ACTIVE'}},
]
const previewProfiles=[
  {inferenceProfileId:'us.amazon.nova-micro-v1:0',
    type:'SYSTEM_DEFINED',status:'ACTIVE',
    models:[{modelArn:MODEL_ARN},{modelArn:PRO_ARN}]},
  {inferenceProfileId:'global.amazon.nova-micro-v1:0',
    type:'SYSTEM_DEFINED',status:'ACTIVE',
    models:[{modelArn:globalArn}]},
  {inferenceProfileId:'us.amazon.nova-micro-v1:0:128k',
    type:'SYSTEM_DEFINED',status:'ACTIVE',
    models:[{modelArn:'arn:aws:bedrock:us-east-1::foundation-model/'+VARIANT}]},
]
const catalog=normalizeBedrockCatalog(models,previewProfiles)
const fullyGreen=normalizeAvailabilityReview(MODEL,{
  modelId:MODEL,authorizationStatus:'AUTHORIZED',entitlementAvailability:'AVAILABLE',
  regionAvailability:'AVAILABLE',agreementAvailability:{status:'AVAILABLE'},
})
const versionless=normalizeAvailabilityReview(MODEL,{
  modelId:'amazon.nova-micro-v1',
  authorizationStatus:'AUTHORIZED',entitlementAvailability:'AVAILABLE',
  regionAvailability:'AVAILABLE',agreementAvailability:{status:'AVAILABLE'},
})

describe('AWS Bedrock phase 3 advisory evidence: no actual inference',()=>{
  it('joins ONLY exact version-specific IDs without guessing model aliases',()=>{
    const r=reviewBedrockReleaseReadiness({modelId:MODEL,snapshot:catalog})
    expect(r.inSourceCatalog).toBe(true)
    expect(r.matchedProfiles.map(p=>p.profileId)).toEqual([
      'global.amazon.nova-micro-v1:0','us.amazon.nova-micro-v1:0',
    ])
    expect(r.matchedProfiles.every(p=>p.canDispatch===false
      && p.getInferenceProfileVerified===false)).toBe(true)
    expect(r.matchedProfiles.every(p=>p.exactModelIdInList)).toBe(true)
    const variant=reviewBedrockReleaseReadiness({modelId:VARIANT,snapshot:catalog})
    expect(variant.matchedProfiles.map(p=>p.profileId))
      .toEqual(['us.amazon.nova-micro-v1:0:128k'])
    expect(variant.availableForCatalogRole).toBe(false)
  })
  it('does not confuse available family metadata with exact-version entitlement',()=>{
    const r=reviewBedrockReleaseReadiness({
      modelId:MODEL,snapshot:catalog,availability:versionless,
      selectedProfileId:'us.amazon.nova-micro-v1:0',
    })
    expect(r.exactAvailabilityIdentityVerified).toBe(false)
    expect(r.availableForCatalogRole).toBe(false)
    expect(r.blockers).toContain('model_identity_or_access_evidence_unverified')
    expect(r.blockers).toContain('get_inference_profile_not_checked')
    expect(r.canDispatch).toBe(false)
    expect(r.priceUsdVerified).toBe(false)
  })
  it('even fully green exact metadata and regional profile cannot clear release',()=>{
    const r=reviewBedrockReleaseReadiness({
      modelId:MODEL,snapshot:catalog,availability:fullyGreen,
      selectedProfileId:'us.amazon.nova-micro-v1:0',
    })
    expect(r.exactAvailabilityIdentityVerified).toBe(true)
    expect(r.availableForCatalogRole).toBe(true)
    expect(r.blockers).toEqual(expect.arrayContaining([
      'get_inference_profile_not_checked',
      'destination_policy_not_approved',
      'live_model_price_and_credits_unverified',
      'governed_spend_reservation_missing',
      'production_role_and_human_authority_missing',
    ]))
    expect(r).toMatchObject({
      status:'blocked',canDispatch:false,modelCallsMade:false,
      priceUsdVerified:false,budgetReserved:false,
      creditApplicationVerified:false,regionProcessingApproved:false,
      productionRoleVerified:false,
    })
  })
  it('global profile is always flagged and cannot infer destination Region',()=>{
    const r=reviewBedrockReleaseReadiness({
      modelId:MODEL,snapshot:catalog,availability:fullyGreen,
      selectedProfileId:'global.amazon.nova-micro-v1:0',
    })
    const profile=r.matchedProfiles.find(
      p=>p.profileId==='global.amazon.nova-micro-v1:0')
    expect(profile?.globalDestinationsUnspecified).toBe(true)
    expect(profile?.listDestinations).toEqual([])
    expect(r.blockers).toContain('global_routing_unbounded')
    expect(r.blockers).toContain('destination_regions_not_explicit')
  })
  it('a different version profile cannot be selected for a base model',()=>{
    const r=reviewBedrockReleaseReadiness({
      modelId:MODEL,snapshot:catalog,availability:fullyGreen,
      selectedProfileId:'us.amazon.nova-micro-v1:0:128k',
    })
    expect(r.blockers).toContain('profile_does_not_exactly_match_model')
    expect(r.canDispatch).toBe(false)
  })
  it('mixed model IDs within a profile always require manual resolution',()=>{
    const mixed=normalizeBedrockCatalog(models,[{
      inferenceProfileId:'us.amazon.mixed',
      type:'SYSTEM_DEFINED',status:'ACTIVE',
      models:[{modelArn:MODEL_ARN},{
        modelArn:'arn:aws:bedrock:us-east-1::foundation-model/'+VARIANT}],
    }])
    const r=reviewBedrockReleaseReadiness({
      modelId:MODEL,snapshot:mixed,availability:fullyGreen,
      selectedProfileId:'us.amazon.mixed',
    })
    expect(r.blockers).toContain('profile_mixed_model_ids_require_review')
  })
  it('source Region mismatches and unknown model IDs cannot borrow evidence',()=>{
    const invalidRegion={...catalog,region:'eu-west-1'} as never
    const r=reviewBedrockReleaseReadiness({
      modelId:MODEL,snapshot:invalidRegion,availability:fullyGreen,
    })
    expect(r.blockers).toContain('source_catalog_unverified')
    expect(r.inSourceCatalog).toBe(false)
    const unknown=reviewBedrockReleaseReadiness({
      modelId:'amazon.unknown-model-v1:0',snapshot:catalog,
      availability:fullyGreen,
    })
    expect(unknown.blockers).toContain('model_not_in_source_catalog')
    expect(unknown.exactAvailabilityIdentityVerified).toBe(false)
    expect(unknown.canDispatch).toBe(false)
  })
  it('missing, invalid or legacy model selection remains blocked',()=>{
    const missing=reviewBedrockReleaseReadiness({
      modelId:'arn:aws:bedrock:::foundation-model/'+MODEL,snapshot:catalog,
    })
    expect(missing.modelId).toBe(null)
    expect(missing.blockers).toContain('invalid_model_identifier')
    const inactive=normalizeBedrockCatalog([
      {...models[0],modelLifecycle:{status:'LEGACY'}},
    ],[])
    const r=reviewBedrockReleaseReadiness({
      modelId:MODEL,snapshot:inactive,availability:fullyGreen,
    })
    expect(r.blockers).toContain('model_not_active')
    expect(r.canDispatch).toBe(false)
  })
})
