import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATALOG_READ_ROLE } from '@/lib/ai/model-control/catalog-oidc'

const mocked=vi.hoisted(()=>({
  operator:vi.fn(),
  assume:vi.fn(),
  discover:vi.fn(),
}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:mocked.operator}))
vi.mock('@/lib/ai/model-control/catalog-oidc',()=>({
  CATALOG_READ_ROLE:'arn:aws:iam::793854110735:role/Omnira-Bedrock-Catalog-Preview',
  getCatalogReadCredentials:mocked.assume,
}))
vi.mock('@/lib/ai/model-control/bedrock-catalog-service',()=>({
  readAwsBedrockCatalog:mocked.discover,
}))
const ORIGIN='https://test-preview.vercel.app'
const old={...Object.fromEntries([
  'VERCEL_ENV','VERCEL_GIT_COMMIT_REF','OMNIRA_BEDROCK_CATALOG_DISCOVERY_ENABLED',
  'AWS_BEDROCK_CATALOG_ROLE_ARN'].map(k=>[k,process.env[k]]))}
function request(headers:Record<string,string>={},body='{}'){
  return new Request(ORIGIN+'/api/model-control/bedrock-catalog',{
    method:'POST',headers:{
      origin:ORIGIN,'sec-fetch-site':'same-origin',
      'content-type':'application/json','x-vercel-oidc-token':'synthetic.jwt',
      ...headers,
    },body,
  })
}
async function call(r:Request){
  const {POST}=await import('@/app/api/model-control/bedrock-catalog/route')
  const reply=await POST(r)
  return {status:reply.status,body:await reply.json(),headers:reply.headers}
}
beforeEach(()=>{
  vi.clearAllMocks()
  process.env.VERCEL_ENV='preview'
  process.env.VERCEL_GIT_COMMIT_REF='feat/omnira-bedrock-pilot-20261116'
  delete process.env.OMNIRA_BEDROCK_CATALOG_DISCOVERY_ENABLED
  delete process.env.AWS_BEDROCK_CATALOG_ROLE_ARN
  mocked.operator.mockResolvedValue({ok:true,actor:'user:operator',userId:'operator'})
  mocked.assume.mockResolvedValue({accessKeyId:'MOCK_ACCESS',secretAccessKey:'MOCK_SECRET',sessionToken:'MOCK_TOKEN'})
  mocked.discover.mockResolvedValue({
    source:'aws-bedrock-control-plane',region:'us-east-1',completeForRegion:true,
    models:[{modelId:'amazon.nova-micro-v1:0',modelName:'Nova Micro',providerName:'Amazon',
      accountEntitlementVerified:false,canDispatch:false}],
    profiles:[],modelCallsMade:false,credentialsExposed:false,
    priceVerified:false,canDispatch:false,accountEntitlementVerified:false,
  })
})
afterAll(()=>{for(const [k,v] of Object.entries(old)){
  if(v===undefined)delete process.env[k]
  else process.env[k]=v
}})
describe('Omnira model discovery Preview endpoint is not an invocation route',()=>{
  it('fails closed when disabled, without calling STS or AWS',async()=>{
    const r=await call(request())
    expect(r.status).toBe(200)
    expect(r.body.reason).toBe('read_only_catalog_disabled')
    expect(r.body.canDispatch).toBe(false)
    expect(r.body.modelCallsMade).toBe(false)
    expect(mocked.assume).not.toHaveBeenCalled()
    expect(mocked.discover).not.toHaveBeenCalled()
  })
  it('if flagged but separate role absent, no STS call occurs',async()=>{
    process.env.OMNIRA_BEDROCK_CATALOG_DISCOVERY_ENABLED='true'
    const r=await call(request())
    expect(r.body.reason).toBe('catalog_read_role_not_configured')
    expect(mocked.assume).not.toHaveBeenCalled()
  })
  it('other project Production/Preview branch unavailable before any auth lookup',async()=>{
    process.env.VERCEL_ENV='production'
    expect((await call(request())).status).toBe(404)
    process.env.VERCEL_ENV='preview'
    process.env.VERCEL_GIT_COMMIT_REF='main'
    expect((await call(request())).status).toBe(404)
    expect(mocked.operator).not.toHaveBeenCalled()
  })
  it('cross-origin and body tampering blocked before auth',async()=>{
    expect((await call(request({origin:'https://evil.example'}))).status).toBe(403)
    expect((await call(request({'sec-fetch-site':'cross-site'}))).status).toBe(403)
    expect((await call(request({},'{"modelId":"unsafe"}'))).status).toBe(400)
    expect(mocked.operator).not.toHaveBeenCalled()
  })
  it('only server-side platform operator can inspect private account metadata',async()=>{
    mocked.operator.mockResolvedValueOnce({ok:false,reason:'not_operator'})
    expect((await call(request())).status).toBe(403)
    expect(mocked.assume).not.toHaveBeenCalled()
  })
  it('mocked read-only catalog may be shown, but no invoke rights granted',async()=>{
    process.env.OMNIRA_BEDROCK_CATALOG_DISCOVERY_ENABLED='true'
    process.env.AWS_BEDROCK_CATALOG_ROLE_ARN=CATALOG_READ_ROLE
    const r=await call(request())
    expect(r.status).toBe(200)
    expect(r.body.status).toBe('catalog_listed')
    expect(r.body.models).toHaveLength(1)
    expect(r.body.canDispatch).toBe(false)
    expect(r.body.accountEntitlementVerified).toBe(false)
    expect(r.body.modelCallsMade).toBe(false)
    expect(mocked.assume).toHaveBeenCalledOnce()
    expect(mocked.discover).toHaveBeenCalledOnce()
    expect(r.headers.get('cache-control')).toContain('no-store')
    expect(JSON.stringify(r.body)).not.toContain('MOCK_SECRET')
  })
  it('missing AWS list permissions returns a generic refusal, no raw AWS response',async()=>{
    process.env.OMNIRA_BEDROCK_CATALOG_DISCOVERY_ENABLED='true'
    process.env.AWS_BEDROCK_CATALOG_ROLE_ARN=CATALOG_READ_ROLE
    mocked.discover.mockRejectedValueOnce(new Error('CATALOG_IAM_READ_PERMISSION_MISSING'))
    const r=await call(request())
    expect(r.body.status).toBe('blocked')
    expect(r.body.reason).toBe('catalog_iam_read_permission_missing')
    expect(r.body.canDispatch).toBe(false)
  })
  it('source code never invokes models, publishes or writes to DB',()=>{
    const route=readFileSync(join(process.cwd(),
      'app/api/model-control/bedrock-catalog/route.ts'),'utf8')
    const service=readFileSync(join(process.cwd(),
      'lib/ai/model-control/bedrock-catalog-service.ts'),'utf8')
    expect(route).not.toMatch(/InvokeModel|ConverseCommand|publishArticle|logLlmCost|withGovernedSpend|\.insert\(/)
    const codeOnly=service.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'')
    expect(codeOnly).not.toMatch(/InvokeModel|ConverseCommand|BedrockRuntimeClient|\.insert\(/)
    expect(service).toContain('ListFoundationModelsCommand')
    expect(service).toContain('ListInferenceProfilesCommand')
    expect(service).toContain('maxAttempts: 1')
    expect(service).toContain('credentials: {')
  })
})
