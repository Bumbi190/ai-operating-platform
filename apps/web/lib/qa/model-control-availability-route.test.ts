import {afterAll, beforeEach, describe, expect, it, vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'

const calls=vi.hoisted(()=>({
  operator:vi.fn(),assume:vi.fn(),availability:vi.fn(),
}))
vi.mock('@/lib/auth/platform-operator',()=>({
  resolvePlatformOperator:calls.operator,
}))
vi.mock('@/lib/ai/model-control/catalog-oidc',()=>({
  CATALOG_READ_ROLE:'arn:aws:iam::793854110735:role/Omnira-Bedrock-Catalog-Preview',
  getCatalogReadCredentials:calls.assume,
}))
vi.mock('@/lib/ai/model-control/availability-service',()=>({
  readBedrockModelAvailability:calls.availability,
}))
const ORIGIN='https://preview-test.vercel.app'
const ROLE='arn:aws:iam::793854110735:role/Omnira-Bedrock-Catalog-Preview'
const MODEL='amazon.nova-micro-v1:0'
const envNames=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','AWS_BEDROCK_CATALOG_ROLE_ARN',
  'OMNIRA_BEDROCK_AVAILABILITY_ENABLED']
const initial=Object.fromEntries(envNames.map(k=>[k,process.env[k]]))
function request(input:unknown={modelId:MODEL},headers:Record<string,string>={}){
  return new Request(ORIGIN+'/api/model-control/bedrock-availability',{
    method:'POST',headers:{
      'origin':ORIGIN,'sec-fetch-site':'same-origin','content-type':'application/json',
      'x-vercel-oidc-token':'synthetic-oidc',
      ...headers,
    },body:JSON.stringify(input),
  })
}
async function call(r:Request){
  const {POST}=await import('@/app/api/model-control/bedrock-availability/route')
  const resp=await POST(r)
  return {http:resp.status,json:await resp.json(),headers:resp.headers}
}
beforeEach(()=>{
  vi.clearAllMocks()
  process.env.VERCEL_ENV='preview'
  process.env.VERCEL_GIT_COMMIT_REF='feat/omnira-bedrock-pilot-20261116'
  process.env.AWS_BEDROCK_CATALOG_ROLE_ARN=ROLE
  delete process.env.OMNIRA_BEDROCK_AVAILABILITY_ENABLED
  calls.operator.mockResolvedValue({ok:true,actor:'user:operator'})
  calls.assume.mockResolvedValue({
    accessKeyId:'FAKE',secretAccessKey:'SECRET',sessionToken:'SESSION',
  })
  calls.availability.mockResolvedValue({
    status:'reviewed',modelId:MODEL,sourceRegion:'us-east-1',
    accessForCatalogRole:'reported_available',canDispatch:false,
    productionInvocationVerified:false,modelCallsMade:false,
  })
})
afterAll(()=>{for(const [key,val] of Object.entries(initial)){
  if(val === undefined) delete process.env[key]
  else process.env[key]=val
}})

describe('Operator-only, manually requested Bedrock availability review',()=>{
  it('disabled by default despite catalog discovery being already live',async()=>{
    const r=await call(request())
    expect(r.json.reason).toBe('availability_review_disabled')
    expect(r.json.canDispatch).toBe(false)
    expect(calls.operator).toHaveBeenCalledOnce()
    expect(calls.assume).not.toHaveBeenCalled()
    expect(calls.availability).not.toHaveBeenCalled()
  })
  it('production and other Preview branches reject before auth and STS',async()=>{
    process.env.VERCEL_ENV='production'
    expect((await call(request())).http).toBe(404)
    process.env.VERCEL_ENV='preview'
    process.env.VERCEL_GIT_COMMIT_REF='main'
    expect((await call(request())).http).toBe(404)
    expect(calls.operator).not.toHaveBeenCalled()
  })
  it('origin, method body shape and excessive requests rejected before operator',async()=>{
    expect((await call(request({modelId:MODEL},{origin:'https://evil.example'}))).http).toBe(403)
    expect((await call(request({modelId:MODEL},{'sec-fetch-site':'cross-site'}))).http).toBe(403)
    expect((await call(request({modelId:'global/unsafe'}))).http).toBe(400)
    expect((await call(request({modelId:MODEL,grant:true}))).http).toBe(400)
    expect((await call(request({modelId:'a'.repeat(280)}))).http).toBe(413)
    expect(calls.operator).not.toHaveBeenCalled()
  })
  it('operator check required even when extra flag is off',async()=>{
    calls.operator.mockResolvedValueOnce({ok:false,reason:'not_authorized'})
    const r=await call(request())
    expect(r.http).toBe(403)
    expect(r.json.reason).toBe('platform_operator_required')
    expect(calls.assume).not.toHaveBeenCalled()
  })
  it('a configured Preview read permits only a sanitized metadata report',async()=>{
    process.env.OMNIRA_BEDROCK_AVAILABILITY_ENABLED='true'
    const r=await call(request())
    expect(r.http).toBe(200)
    expect(r.headers.get('cache-control')).toContain('no-store')
    expect(r.json.status).toBe('reviewed')
    expect(r.json.canDispatch).toBe(false)
    expect(r.json.productionInvocationVerified).toBe(false)
    expect(calls.assume).toHaveBeenCalledOnce()
    expect(calls.availability).toHaveBeenCalledWith(
      {accessKeyId:'FAKE',secretAccessKey:'SECRET',sessionToken:'SESSION'},MODEL)
    expect(JSON.stringify(r.json)).not.toContain('SECRET')
  })
  it('additional IAM denial is explained without any raw AWS error',async()=>{
    process.env.OMNIRA_BEDROCK_AVAILABILITY_ENABLED='true'
    calls.availability.mockRejectedValueOnce(new Error('AVAILABILITY_IAM_DENIED'))
    const r=await call(request())
    expect(r.json).toMatchObject({
      status:'blocked',reason:'availability_iam_permission_missing',
      modelCallsMade:false,canDispatch:false,
    })
    calls.availability.mockRejectedValueOnce(new Error('Private AWS account or token'))
    const generic=await call(request())
    expect(generic.json.reason).toBe('availability_api_unavailable')
    expect(JSON.stringify(generic.json)).not.toContain('Private')
  })
  it('identity missing versus identity mismatch uses safe distinct codes',async()=>{
    process.env.OMNIRA_BEDROCK_AVAILABILITY_ENABLED='true'
    calls.availability.mockRejectedValueOnce(new Error('AVAILABILITY_RESPONSE_ID_MISSING'))
    const missing=await call(request())
    expect(missing.json.reason).toBe('availability_identity_missing')
    expect(missing.json.canDispatch).toBe(false)
    calls.availability.mockRejectedValueOnce(new Error('AVAILABILITY_RESPONSE_ID_MISMATCH'))
    const mismatch=await call(request())
    expect(mismatch.json.reason).toBe('availability_identity_mismatch')
    expect(mismatch.json.canDispatch).toBe(false)
  })
  it('missing OIDC cannot use existing Remotion access keys',async()=>{
    process.env.OMNIRA_BEDROCK_AVAILABILITY_ENABLED='true'
    const r=await call(request({modelId:MODEL},{'x-vercel-oidc-token':''}))
    expect(r.json.reason).toBe('vercel_oidc_token_missing')
    expect(calls.assume).not.toHaveBeenCalled()
  })
  it('new code never includes invocation, subscription, DB writes or budget bypass',()=>{
    const route=readFileSync(join(process.cwd(),
      'app/api/model-control/bedrock-availability/route.ts'),'utf8')
    const service=readFileSync(join(process.cwd(),
      'lib/ai/model-control/availability-service.ts'),'utf8')
    const code=(route+'\n'+service).replace(/\/\*[\s\S]*?\*\//g,'')
      .replace(/^\s*\/\/.*$/gm,'')
    expect(code).not.toMatch(/InvokeModelCommand|ConverseCommand|BedrockRuntimeClient|aws-marketplace:Subscribe|\.insert\(/)
    expect(service).toContain('GetFoundationModelAvailabilityCommand')
    expect(route).toContain('OMNIRA_BEDROCK_AVAILABILITY_ENABLED')
  })
})
