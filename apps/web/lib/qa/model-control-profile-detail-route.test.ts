import {beforeEach,afterAll,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({operator:vi.fn(),assume:vi.fn(),read:vi.fn()}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:mocks.operator}))
vi.mock('@/lib/ai/model-control/catalog-oidc',()=>({
  CATALOG_READ_ROLE:'arn:aws:iam::793854110735:role/Omnira-Bedrock-Catalog-Preview',
  getCatalogReadCredentials:mocks.assume,
}))
vi.mock('@/lib/ai/model-control/profile-detail-service',()=>({
  validSystemProfileId:(x:unknown)=>typeof x==='string'
    &&/^[A-Za-z0-9.:-]{3,140}$/.test(x),
  readBedrockProfileDetail:mocks.read,
}))
const ORIGIN='https://preview.example'
const ROLE='arn:aws:iam::793854110735:role/Omnira-Bedrock-Catalog-Preview'
const P='us.amazon.nova-lite-v1:0'
const keys=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF',
  'OMNIRA_BEDROCK_PROFILE_DETAIL_ENABLED','AWS_BEDROCK_CATALOG_ROLE_ARN']
const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]))
function req(body:unknown={profileId:P},headers:Record<string,string>={}){
  return new Request(ORIGIN+'/api/model-control/bedrock-profile-detail',{
    method:'POST',headers:{
      origin:ORIGIN,'sec-fetch-site':'same-origin',
      'content-type':'application/json','x-vercel-oidc-token':'synthetic',
      ...headers,
    },body:JSON.stringify(body),
  })
}
async function call(r:Request){
  const {POST}=await import('@/app/api/model-control/bedrock-profile-detail/route')
  const x=await POST(r)
  return {http:x.status,body:await x.json()}
}
beforeEach(()=>{
  vi.clearAllMocks()
  process.env.VERCEL_ENV='preview'
  process.env.VERCEL_GIT_COMMIT_REF='feat/omnira-bedrock-pilot-20261116'
  process.env.AWS_BEDROCK_CATALOG_ROLE_ARN=ROLE
  delete process.env.OMNIRA_BEDROCK_PROFILE_DETAIL_ENABLED
  mocks.operator.mockResolvedValue({ok:true})
  mocks.assume.mockResolvedValue({
    accessKeyId:'SYNTH',secretAccessKey:'NEVER_SHOW',sessionToken:'SYNTH',
  })
  mocks.read.mockResolvedValue({
    status:'profile_detail_listed',profileId:P,sourceRegion:'us-east-1',
    modelIds:['amazon.nova-lite-v1:0'],sourceRegionDetailVerified:true,
    destinationRegions:['us-east-1'],destinationRegionsApproved:false,
    canDispatch:false,modelCallsMade:false,
  })
})
afterAll(()=>{for(const [k,v] of Object.entries(before)){
  if(v===undefined)delete process.env[k];else process.env[k]=v
}})
describe('Preview-only source-bound profile detail endpoint',()=>{
  it('new flag is off by default even when catalog and availability work',async()=>{
    const r=await call(req())
    expect(r.body.reason).toBe('profile_detail_disabled')
    expect(r.body.canDispatch).toBe(false)
    expect(mocks.assume).not.toHaveBeenCalled()
    expect(mocks.read).not.toHaveBeenCalled()
  })
  it('production or unrelated Preview branches cannot call AWS',async()=>{
    process.env.VERCEL_ENV='production'
    expect((await call(req())).http).toBe(404)
    process.env.VERCEL_ENV='preview';process.env.VERCEL_GIT_COMMIT_REF='main'
    expect((await call(req())).http).toBe(404)
    expect(mocks.operator).not.toHaveBeenCalled()
  })
  it('origin mismatch, untrusted profile ARN and extra keys reject early',async()=>{
    expect((await call(req(undefined,{origin:'https://evil.example'}))).http).toBe(403)
    expect((await call(req({profileId:'arn:aws:bedrock:us-east-1:000:inference-profile/evil'}))).http).toBe(400)
    expect((await call(req({profileId:P,invoke:true}))).http).toBe(400)
    expect(mocks.operator).not.toHaveBeenCalled()
  })
  it('only platform operator can inspect profile detail',async()=>{
    mocks.operator.mockResolvedValueOnce({ok:false})
    const r=await call(req())
    expect(r.http).toBe(403)
    expect(mocks.assume).not.toHaveBeenCalled()
  })
  it('new flag on returns only no-dispatch metadata for exactly selected profile',async()=>{
    process.env.OMNIRA_BEDROCK_PROFILE_DETAIL_ENABLED='true'
    const r=await call(req())
    expect(r.http).toBe(200)
    expect(r.body).toMatchObject({
      status:'profile_detail_listed',profileId:P,canDispatch:false,
    })
    expect(mocks.read).toHaveBeenCalledWith({
      accessKeyId:'SYNTH',secretAccessKey:'NEVER_SHOW',sessionToken:'SYNTH',
    },P)
    expect(JSON.stringify(r.body)).not.toContain('NEVER_SHOW')
  })
  it('no OIDC token means no STS or local Remotion key fallback',async()=>{
    process.env.OMNIRA_BEDROCK_PROFILE_DETAIL_ENABLED='true'
    const r=await call(req({profileId:P},{'x-vercel-oidc-token':''}))
    expect(r.body.reason).toBe('vercel_oidc_token_missing')
    expect(mocks.assume).not.toHaveBeenCalled()
  })
  it('missing IAM read permission produces sanitized error, never raw AWS',async()=>{
    process.env.OMNIRA_BEDROCK_PROFILE_DETAIL_ENABLED='true'
    mocks.read.mockRejectedValueOnce(new Error('PROFILE_READ_IAM_DENIED'))
    const r=await call(req())
    expect(r.body.reason).toBe('profile_iam_read_permission_missing')
    mocks.read.mockRejectedValueOnce(new Error('token-or-account-secret'))
    const other=await call(req())
    expect(other.body.reason).toBe('profile_read_unavailable')
    expect(JSON.stringify(other.body)).not.toContain('token-or-account-secret')
  })
})
