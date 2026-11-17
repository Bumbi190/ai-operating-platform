import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake=vi.hoisted(()=>({
  created: [] as any[],
  calls: [] as {command:string;input:Record<string,unknown>}[],
  denied: false,
  failOnSecondPage: false,
  invalidModelId: false,
  invalidDestinationArn: false,
  destroyed: 0,
}))
vi.mock('@aws-sdk/client-bedrock',()=>({
  ListFoundationModelsCommand:class {
    input:Record<string,unknown>
    constructor(input:Record<string,unknown>){this.input=input}
  },
  ListInferenceProfilesCommand:class {
    input:Record<string,unknown>
    constructor(input:Record<string,unknown>){this.input=input}
  },
  BedrockClient:class {
    constructor(cfg:any){fake.created.push(cfg)}
    async send(command:any, options:any){
      expect(options.abortSignal).toBeInstanceOf(AbortSignal)
      const type=command.constructor.name
      fake.calls.push({command:type,input:command.input})
      if(fake.denied){
        const err=new Error('Raw AWS account 123456789 private IAM policy!')
        err.name='AccessDeniedException'
        throw err
      }
      if(type==='ListFoundationModelsCommand')return {
        modelSummaries:[{modelId:fake.invalidModelId ? 'invalid model id' : 'amazon.nova-micro-v1:0',modelName:'Nova Micro',
          providerName:'Amazon',outputModalities:['TEXT'],inputModalities:['TEXT'],
          inferenceTypesSupported:['ON_DEMAND'],modelLifecycle:{status:'ACTIVE'}}],
      }
      if(type==='ListInferenceProfilesCommand'){
        if(command.input.nextToken==='page-2'){
          if(fake.failOnSecondPage)throw Error('Private AWS session from unexpected failure')
          return {
            inferenceProfileSummaries:[{inferenceProfileId:'us.nova-pro',status:'ACTIVE',
              type:'SYSTEM_DEFINED',models:[{modelArn:
                fake.invalidDestinationArn ? 'unrecognized-destination' : 'arn:aws:bedrock:us-west-2::foundation-model/amazon.nova-pro-v1:0'}]}],
          }
        }
        return {inferenceProfileSummaries:[],nextToken:'page-2'}
      }
      throw Error('UNEXPECTED_MODEL_INVOKE_ATTEMPT')
    }
    destroy(){fake.destroyed++}
  },
}))

const creds={accessKeyId:'TEMP_ACCESS',secretAccessKey:'TEMP_SECRET',sessionToken:'TEMP_SESSION'}
beforeEach(()=>{
  fake.created.length=0;fake.calls.length=0
  fake.denied=false;fake.failOnSecondPage=false;fake.destroyed=0
  fake.invalidModelId=false;fake.invalidDestinationArn=false
})
describe('Real catalog provider adapter with mocked AWS SDK transport',()=>{
  it('issues ONLY foundation list + paginated profile list, exact OIDC credentials',async()=>{
    const {readAwsBedrockCatalog}=await import('@/lib/ai/model-control/bedrock-catalog-service')
    const r=await readAwsBedrockCatalog(creds)
    expect(fake.calls.map(c=>c.command)).toEqual([
      'ListFoundationModelsCommand','ListInferenceProfilesCommand','ListInferenceProfilesCommand'])
    expect(fake.calls[0].input).toEqual({})
    expect(fake.calls[1].input).toMatchObject({maxResults:100})
    expect(fake.calls[2].input).toMatchObject({nextToken:'page-2'})
    expect(fake.created[0]).toMatchObject({
      region:'us-east-1',maxAttempts:1,credentials:creds,
    })
    expect(fake.destroyed).toBe(1)
    expect(r.models).toHaveLength(1)
    expect(r.profiles).toHaveLength(1)
    expect(r.profiles[0].destinations).toEqual(['us-west-2'])
    expect(r.modelCallsMade).toBe(false)
    expect(r.canDispatch).toBe(false)
    expect(r.accountEntitlementVerified).toBe(false)
    expect(JSON.stringify(r)).not.toContain('TEMP_SECRET')
  })
  it('no default AWS credential chain or remote request without explicit creds',async()=>{
    const {readAwsBedrockCatalog}=await import('@/lib/ai/model-control/bedrock-catalog-service')
    await expect(readAwsBedrockCatalog({
      accessKeyId:'',secretAccessKey:'',sessionToken:'',
    })).rejects.toThrow('CATALOG_EXPLICIT_CREDENTIALS_REQUIRED')
    expect(fake.created).toHaveLength(0)
  })
  it('AWS missing permissions fail closed without raw IAM details',async()=>{
    fake.denied=true
    const {readAwsBedrockCatalog}=await import('@/lib/ai/model-control/bedrock-catalog-service')
    await expect(readAwsBedrockCatalog(creds)).rejects.toThrow('CATALOG_IAM_READ_PERMISSION_MISSING')
    expect(fake.destroyed).toBe(1)
  })
  it('returns sanitized error category for an unexpected model ID',async()=>{
    fake.invalidModelId=true
    const {readAwsBedrockCatalog}=await import('@/lib/ai/model-control/bedrock-catalog-service')
    await expect(readAwsBedrockCatalog(creds)).rejects.toThrow(
      'CATALOG_RESPONSE_INCOMPLETE:invalid_model_identifier')
    expect(fake.destroyed).toBe(1)
  })
  it('returns sanitized error category for an unknown inference destination',async()=>{
    fake.invalidDestinationArn=true
    const {readAwsBedrockCatalog}=await import('@/lib/ai/model-control/bedrock-catalog-service')
    await expect(readAwsBedrockCatalog(creds)).rejects.toThrow(
      'CATALOG_RESPONSE_INCOMPLETE:invalid_profile_destination')
    expect(fake.destroyed).toBe(1)
  })
  it('a failed later profile page cannot return incomplete model list',async()=>{
    fake.failOnSecondPage=true
    const {readAwsBedrockCatalog}=await import('@/lib/ai/model-control/bedrock-catalog-service')
    await expect(readAwsBedrockCatalog(creds)).rejects.toThrow('CATALOG_API_UNAVAILABLE')
    expect(fake.destroyed).toBe(1)
  })
})
