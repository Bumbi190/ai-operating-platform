import {beforeEach,describe,expect,it,vi} from 'vitest'

const PROFILE='us.amazon.nova-lite-v1:0'
const MODEL='amazon.nova-lite-v1:0'
const ARN='arn:aws:bedrock:us-east-1::foundation-model/'+MODEL
const state=vi.hoisted(()=>({
  calls:[] as string[],
  cfg:null as any,
  destroyed:0,
  denied:false,
  unlisted:false,
  mismatch:false,
  global:false,
  missingModels:false,
  badType:false,
}))
vi.mock('@aws-sdk/client-bedrock',()=>({
  ListInferenceProfilesCommand:class {constructor(public input:any){}},
  GetInferenceProfileCommand:class {constructor(public input:any){}},
  BedrockClient:class{
    constructor(cfg:any){state.cfg=cfg}
    async send(cmd:any,options:any){
      expect(options.abortSignal).toBeInstanceOf(AbortSignal)
      state.calls.push(cmd.constructor.name)
      if(state.denied){
        const e=new Error('Private AWS account details')
        e.name='AccessDeniedException'
        throw e
      }
      if(cmd.constructor.name==='ListInferenceProfilesCommand'){
        expect(cmd.input.maxResults).toBe(100)
        return {inferenceProfileSummaries:state.unlisted?[]:[{
          inferenceProfileId:PROFILE,status:'ACTIVE',type:'SYSTEM_DEFINED',
          inferenceProfileArn:'arn:aws:bedrock:us-east-1:123456789012:inference-profile/'+PROFILE,
        }]}
      }
      if(cmd.constructor.name==='GetInferenceProfileCommand'){
        expect(cmd.input).toEqual({inferenceProfileIdentifier:PROFILE})
        return {
          inferenceProfileId:state.mismatch?'global.anthropic.other':PROFILE,
          type:state.badType?'APPLICATION':'SYSTEM_DEFINED',
          status:'ACTIVE',
          inferenceProfileArn:'arn:aws:bedrock:us-east-1:123456789012:inference-profile/'+PROFILE,
          models:state.missingModels?[]:[{
            modelArn:state.global
              ?'arn:aws:bedrock:::foundation-model/'+MODEL
              :'arn:aws:bedrock:us-east-1::foundation-model/'+MODEL,
          }],
        }
      }
      throw new Error('UNEXPECTED_RUNTIME_CALL')
    }
    destroy(){state.destroyed++}
  },
}))
const C={accessKeyId:'A',secretAccessKey:'B',sessionToken:'C'}
beforeEach(()=>{
  state.calls.length=0;state.cfg=null;state.destroyed=0
  state.denied=false;state.unlisted=false;state.mismatch=false
  state.global=false;state.missingModels=false;state.badType=false
})
describe('Bedrock source-bound GetInferenceProfile transport (mocked, no invocation)',()=>{
  it('requires the exact profile in List before one Get, returns no permission',async()=>{
    const {readBedrockProfileDetail}=await import('@/lib/ai/model-control/profile-detail-service')
    const r=await readBedrockProfileDetail(C,PROFILE)
    expect(state.calls).toEqual([
      'ListInferenceProfilesCommand','GetInferenceProfileCommand'])
    expect(state.cfg).toMatchObject({
      region:'us-east-1',credentials:C,maxAttempts:1})
    expect(r).toMatchObject({
      status:'profile_detail_listed',sourceRegion:'us-east-1',profileId:PROFILE,
      modelIds:[MODEL],destinationRegions:['us-east-1'],sourceRegionDetailVerified:true,
      destinationRegionsApproved:false,priceVerified:false,
      canDispatch:false,modelCallsMade:false,
    })
    expect(state.destroyed).toBe(1)
    expect(JSON.stringify(r)).not.toContain('secretAccessKey')
  })
  it('a global regionless model ARN is NOT mistaken for US-only approval',async()=>{
    state.global=true
    const {readBedrockProfileDetail}=await import('@/lib/ai/model-control/profile-detail-service')
    const r=await readBedrockProfileDetail(C,PROFILE)
    expect(r.destinationRegions).toEqual([])
    expect(r.globalDestinationUnspecified).toBe(true)
    expect(r.destinationRegionsApproved).toBe(false)
    expect(r.canDispatch).toBe(false)
  })
  it('rejects an arbitrary or unlisted profile before requesting details',async()=>{
    const {readBedrockProfileDetail}=await import('@/lib/ai/model-control/profile-detail-service')
    await expect(readBedrockProfileDetail(C,'arn:aws:bedrock:::inference-profile/evil'))
      .rejects.toThrow('PROFILE_INVALID_IDENTIFIER')
    expect(state.calls).toHaveLength(0)
    state.unlisted=true
    await expect(readBedrockProfileDetail(C,PROFILE))
      .rejects.toThrow('PROFILE_NOT_UNIQUELY_LISTED')
    expect(state.calls).toEqual(['ListInferenceProfilesCommand'])
  })
  it('refuses AWS profile identity substitution or unexpected profile type',async()=>{
    const {readBedrockProfileDetail}=await import('@/lib/ai/model-control/profile-detail-service')
    state.mismatch=true
    await expect(readBedrockProfileDetail(C,PROFILE))
      .rejects.toThrow('PROFILE_DETAIL_IDENTITY_OR_STATUS_MISMATCH')
    state.mismatch=false;state.badType=true;state.calls.length=0
    await expect(readBedrockProfileDetail(C,PROFILE))
      .rejects.toThrow('PROFILE_DETAIL_IDENTITY_OR_STATUS_MISMATCH')
  })
  it('empty model destinations cannot become a verified profile',async()=>{
    state.missingModels=true
    const {readBedrockProfileDetail}=await import('@/lib/ai/model-control/profile-detail-service')
    await expect(readBedrockProfileDetail(C,PROFILE))
      .rejects.toThrow('PROFILE_DETAIL_IDENTITY_OR_STATUS_MISMATCH')
    expect(state.destroyed).toBe(1)
  })
  it('IAM denial is sanitized and not mistaken for an empty catalog',async()=>{
    state.denied=true
    const {readBedrockProfileDetail}=await import('@/lib/ai/model-control/profile-detail-service')
    await expect(readBedrockProfileDetail(C,PROFILE))
      .rejects.toThrow('PROFILE_READ_IAM_DENIED')
    expect(state.destroyed).toBe(1)
  })
  it('never uses local AWS credentials or default provider fallback',async()=>{
    const {readBedrockProfileDetail}=await import('@/lib/ai/model-control/profile-detail-service')
    await expect(readBedrockProfileDetail({
      accessKeyId:'',secretAccessKey:'',sessionToken:'',
    },PROFILE)).rejects.toThrow('PROFILE_EXPLICIT_CREDENTIALS_REQUIRED')
    expect(state.cfg).toBe(null)
  })
})
