// Local-only Node tests. No AWS network calls or billable inference.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { POST } from '../../app/api/bedrock-pilot-check/route.ts'

const originalFetch = globalThis.fetch
const names = ['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','AWS_BEDROCK_ROLE_ARN','AWS_BEDROCK_REGION']
const original = Object.fromEntries(names.map(k=>[k,process.env[k]]))
const role = 'arn:aws:iam::793854110735:role/Omnira-Bedrock-Test'
function setPreview() {
  process.env.VERCEL_ENV='preview'
  process.env.VERCEL_GIT_COMMIT_REF='feat/omnira-bedrock-pilot-20261116'
  process.env.AWS_BEDROCK_ROLE_ARN=role
  process.env.AWS_BEDROCK_REGION='us-east-1'
}
function req(token='fake-test-token') {
  return new Request('https://example.test/api/bedrock-pilot-check', {
    method:'POST',
    headers:token?{'x-vercel-oidc-token':token}:{},
  })
}
afterEach(()=>{
  globalThis.fetch=originalFetch
  for(const k of names) original[k] === undefined ? delete process.env[k] : process.env[k]=original[k]
})
test('production is closed without AWS calls', async()=>{
  setPreview(); process.env.VERCEL_ENV='production'
  globalThis.fetch=()=>{throw Error('unexpected AWS call')}
  assert.equal((await POST(req())).status,404)
})
test('other preview branches are closed without AWS calls', async()=>{
  setPreview(); process.env.VERCEL_GIT_COMMIT_REF='main'
  globalThis.fetch=()=>{throw Error('unexpected AWS call')}
  assert.equal((await POST(req())).status,404)
})
test('invalid role is rejected before AWS calls', async()=>{
  setPreview(); process.env.AWS_BEDROCK_ROLE_ARN='arn:aws:iam::111111111111:role/admin'
  globalThis.fetch=()=>{throw Error('unexpected AWS call')}
  assert.equal((await POST(req())).status,503)
})
test('missing injected Vercel token is rejected',async()=>{
  setPreview()
  globalThis.fetch=()=>{throw Error('unexpected AWS call')}
  assert.equal((await POST(req(''))).status,401)
})
test('STS success returns boolean only, never AWS credentials',async()=>{
  setPreview()
  let count=0
  globalThis.fetch=async (url, opts)=>{
    count++
    assert.equal(url,'https://sts.us-east-1.amazonaws.com/')
    const params=new URLSearchParams(opts.body)
    assert.equal(params.get('Action'),'AssumeRoleWithWebIdentity')
    assert.equal(params.get('RoleArn'),role)
    assert.equal(params.get('WebIdentityToken'),'fake-test-token')
    assert.equal(params.get('DurationSeconds'),'900')
    return new Response('<AssumeRoleWithWebIdentityResponse><Credentials><SecretAccessKey>DO_NOT_EXPOSE</SecretAccessKey></Credentials><AssumedRoleUser><Arn>arn:aws:sts::793854110735:assumed-role/Omnira-Bedrock-Test/session</Arn></AssumedRoleUser></AssumeRoleWithWebIdentityResponse>', {status:200})
  }
  const result=await POST(req())
  assert.equal(result.status,200)
  const txt=await result.text()
  assert.deepEqual(JSON.parse(txt),{status:'verified',oidcRoleAssumed:true,bedrockInvoked:false})
  assert.equal(txt.includes('DO_NOT_EXPOSE'),false)
  assert.equal(count,1)
})
test('STS rejection returns generic result only',async()=>{
  setPreview()
  globalThis.fetch=async()=>new Response('<Error><Code>InvalidIdentityToken</Code><Message>secret error</Message></Error>',{status:403})
  const result=await POST(req())
  assert.equal(result.status,502)
  assert.deepEqual(await result.json(),{status:'oidc_role_assumption_not_verified'})
})
