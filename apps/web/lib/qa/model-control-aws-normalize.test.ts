import { describe, expect, it, vi } from 'vitest'
import {
  CATALOG_REGION, CATALOG_MAX_FOUNDATIONS, CATALOG_MAX_PROFILE_PAGES,
  collectInferenceProfiles, normalizeBedrockCatalog,
} from '@/lib/ai/model-control/discovery-normalize'

const amazon={
  modelId:'amazon.nova-micro-v1:0', modelName:'Nova Micro', providerName:'Amazon',
  inputModalities:['TEXT'], outputModalities:['TEXT'],
  inferenceTypesSupported:['ON_DEMAND'], responseStreamingSupported:false,
  modelLifecycle:{status:'ACTIVE'},
}
const profile={
  inferenceProfileId:'us.amazon.nova-pro-v1:0',
  inferenceProfileName:'US Nova Pro',
  status:'ACTIVE',type:'SYSTEM_DEFINED',
  models:[
    {modelArn:'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0'},
    {modelArn:'arn:aws:bedrock:us-west-2::foundation-model/amazon.nova-pro-v1:0'},
  ],
}
describe('AWS read-only catalog normalization and pagination',()=>{
  it('stores precise metadata but never marks models as paid-accessible',()=>{
    const normalized=normalizeBedrockCatalog([amazon],[profile])
    expect(normalized.region).toBe(CATALOG_REGION)
    expect(normalized.completeForRegion).toBe(true)
    expect(normalized.models[0]).toMatchObject({
      modelId:'amazon.nova-micro-v1:0',providerName:'Amazon',
      outputModalities:['TEXT'],lifecycle:'ACTIVE',streaming:false,
      accountEntitlementVerified:false,invocationPermissionVerified:false,
      priceVerified:false,canDispatch:false,
    })
    expect(normalized.profiles[0]).toMatchObject({
      profileId:'us.amazon.nova-pro-v1:0',destinations:['us-east-1','us-west-2'],
      destinationRegionsApproved:false,priceVerified:false,canDispatch:false,
    })
    expect(normalized.modelCallsMade).toBe(false)
    expect(normalized.credentialsExposed).toBe(false)
    expect(normalized.accountEntitlementVerified).toBe(false)
  })
  it('duplicate model ID or profile ID blocks whole snapshot',()=>{
    expect(()=>normalizeBedrockCatalog([amazon,amazon],[])).toThrow('BEDROCK_CATALOG_DUPLICATE_MODEL')
    expect(()=>normalizeBedrockCatalog([],[profile,profile])).toThrow('BEDROCK_CATALOG_DUPLICATE_PROFILE')
  })
  it('malformed IDs and profile destinations block rather than normalize to a fake model',()=>{
    expect(()=>normalizeBedrockCatalog([{modelId:'../bad model',modelName:'abc'}],[])).toThrow()
    expect(()=>normalizeBedrockCatalog([],[{inferenceProfileId:'abc',models:[{modelArn:'not-an-arn'}]}])).toThrow()
  })
  it('hard maximum protects runtime and response payload size',()=>{
    const entries=Array.from({length:CATALOG_MAX_FOUNDATIONS+1},(_,i)=>({
      modelId:'model.'+i,modelName:'Model '+i,
    }))
    expect(()=>normalizeBedrockCatalog(entries,[])).toThrow('BEDROCK_CATALOG_SIZE_INVALID')
  })
  it('collects all profile pages without silently dropping token-bound entries',async()=>{
    const page=vi.fn(async (token?:string)=>{
      if(!token)return {inferenceProfileSummaries:[profile],nextToken:'page-2'}
      expect(token).toBe('page-2')
      return {inferenceProfileSummaries:[{...profile,inferenceProfileId:'us.second.profile'}]}
    })
    const all=await collectInferenceProfiles(page)
    expect(all).toHaveLength(2)
    expect(page).toHaveBeenCalledTimes(2)
  })
  it('a repeat token fails closed rather than looping indefinitely',async()=>{
    const page=vi.fn(async()=>({inferenceProfileSummaries:[],nextToken:'same'}))
    await expect(collectInferenceProfiles(page)).rejects.toThrow('BEDROCK_CATALOG_INVALID_PAGE_TOKEN')
  })
  it('a missing page list is never treated as zero available profiles',async()=>{
    await expect(collectInferenceProfiles(async()=>({}))).rejects.toThrow('BEDROCK_CATALOG_INVALID_PROFILE_RESPONSE')
  })
  it('pagination cap fails closed and never offers an incomplete catalog',async()=>{
    const page=vi.fn(async (token?:string)=>({
      inferenceProfileSummaries:[],
      nextToken:'next-'+(token?Number(token.slice(5))+1:1),
    }))
    await expect(collectInferenceProfiles(page)).rejects.toThrow('BEDROCK_CATALOG_PROFILE_PAGINATION_INCOMPLETE')
    expect(page).toHaveBeenCalledTimes(CATALOG_MAX_PROFILE_PAGES)
  })
  it('AWS ListFoundationModels is not paged unlike inference profiles',()=>{
    const src=normalizeBedrockCatalog([amazon],[])
    expect(src.models).toHaveLength(1)
    expect(src.profiles).toHaveLength(0)
    expect(src.completeForRegion).toBe(true)
  })
})
