import {beforeEach, describe, expect, it, vi} from 'vitest'

const fake=vi.hoisted(()=>({
  calls:[] as string[], config:null as any, destroyed:0,
  deny:false, unknown:false, malformed:false, missingId:false,
}))
vi.mock('@aws-sdk/client-bedrock',()=>({
  ListFoundationModelsCommand:class {constructor(public input:any){}},
  GetFoundationModelAvailabilityCommand:class {constructor(public input:any){}},
  BedrockClient:class {
    constructor(config:any){fake.config=config}
    async send(cmd:any, opts:any) {
      expect(opts.abortSignal).toBeInstanceOf(AbortSignal)
      fake.calls.push(cmd.constructor.name)
      if(fake.deny){const e=new Error('private AWS IAM data');e.name='AccessDeniedException';throw e}
      if(cmd.constructor.name==='ListFoundationModelsCommand')return {
        modelSummaries:fake.malformed ? undefined : [
          {modelId:'amazon.nova-micro-v1:0'}, {modelId:'anthropic.claude-sonnet-4-6'},
        ],
      }
      if(cmd.constructor.name==='GetFoundationModelAvailabilityCommand') {
        expect(cmd.input).toEqual({modelId:'amazon.nova-micro-v1:0'})
        return {modelId:fake.missingId?undefined:(fake.unknown?'other.model':'amazon.nova-micro-v1:0'),
          authorizationStatus:'AUTHORIZED',entitlementAvailability:'AVAILABLE',
          regionAvailability:'AVAILABLE',agreementAvailability:{status:'AVAILABLE'},
        }
      }
      throw Error('UNEXPECTED_MODEL_INVOCATION')
    }
    destroy(){fake.destroyed++}
  },
}))

const CREDS={accessKeyId:'TEMP_ID',secretAccessKey:'TEMP_SECRET',sessionToken:'TEMP_SESSION'}
beforeEach(()=>{
  fake.calls.length=0;fake.config=null;fake.destroyed=0
  fake.deny=false;fake.unknown=false;fake.malformed=false;fake.missingId=false
})

describe('Non-inferencing AWS availability transport',()=>{
  it('lists in us-east-1 then checks one model using explicit OIDC creds',async()=>{
    const {readBedrockModelAvailability}=await import('@/lib/ai/model-control/availability-service')
    const result=await readBedrockModelAvailability(CREDS,'amazon.nova-micro-v1:0')
    expect(fake.calls).toEqual(['ListFoundationModelsCommand',
      'GetFoundationModelAvailabilityCommand'])
    expect(fake.config).toMatchObject({region:'us-east-1',credentials:CREDS,maxAttempts:1})
    expect(fake.destroyed).toBe(1)
    expect(result.modelCallsMade).toBe(false)
    expect(result.canDispatch).toBe(false)
    expect(JSON.stringify(result)).not.toContain('TEMP_SECRET')
  })
  it('arbitrary unlisted IDs and profile IDs never reach availability API',async()=>{
    const {readBedrockModelAvailability}=await import('@/lib/ai/model-control/availability-service')
    await expect(readBedrockModelAvailability(CREDS,'global.anthropic.claude-sonnet-4-6'))
      .rejects.toThrow('AVAILABILITY_MODEL_NOT_LISTED')
    expect(fake.calls).toEqual(['ListFoundationModelsCommand'])
    expect(fake.destroyed).toBe(1)
  })
  it('bad credentials cannot create an AWS client',async()=>{
    const {readBedrockModelAvailability}=await import('@/lib/ai/model-control/availability-service')
    await expect(readBedrockModelAvailability({
      accessKeyId:'',secretAccessKey:'',sessionToken:'',
    },'amazon.nova-micro-v1:0')).rejects.toThrow('AVAILABILITY_CREDENTIALS_MISSING')
    expect(fake.config).toBe(null)
  })
  it('invalid catalog response fails closed',async()=>{
    fake.malformed=true
    const {readBedrockModelAvailability}=await import('@/lib/ai/model-control/availability-service')
    await expect(readBedrockModelAvailability(CREDS,'amazon.nova-micro-v1:0'))
      .rejects.toThrow('AVAILABILITY_CATALOG_INVALID')
    expect(fake.destroyed).toBe(1)
  })
  it('AWS IAM denial never propagates raw error',async()=>{
    fake.deny=true
    const {readBedrockModelAvailability}=await import('@/lib/ai/model-control/availability-service')
    await expect(readBedrockModelAvailability(CREDS,'amazon.nova-micro-v1:0'))
      .rejects.toThrow('AVAILABILITY_IAM_DENIED')
    expect(fake.destroyed).toBe(1)
  })
  it('mismatched model response is rejected with no partial positive result',async()=>{
    fake.unknown=true
    const {readBedrockModelAvailability}=await import('@/lib/ai/model-control/availability-service')
    await expect(readBedrockModelAvailability(CREDS,'amazon.nova-micro-v1:0'))
      .rejects.toThrow('AVAILABILITY_RESPONSE_ID_MISMATCH')
    expect(fake.destroyed).toBe(1)
  })
  it('an AWS response missing its ID is diagnosed without treating it as entitlement',async()=>{
    fake.missingId=true
    const {readBedrockModelAvailability}=await import('@/lib/ai/model-control/availability-service')
    await expect(readBedrockModelAvailability(CREDS,'amazon.nova-micro-v1:0'))
      .rejects.toThrow('AVAILABILITY_RESPONSE_ID_MISSING')
    expect(fake.destroyed).toBe(1)
  })
})
