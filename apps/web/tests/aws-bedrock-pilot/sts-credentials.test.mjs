import { test } from 'node:test'
import assert from 'node:assert/strict'
import { obtainPreviewCredentials, BEDROCK_PILOT_ROLE } from '../../lib/ai/bedrock-pilot/sts-credentials.ts'

const configured = { configuredRoleArn: BEDROCK_PILOT_ROLE, configuredRegion:'us-east-1', oidcToken:'test.jwt.here' }
function neverFetch(){throw new Error('STS request should not be made')}
test('missing or wrong IAM role denied before STS',async()=>{
  await assert.rejects(obtainPreviewCredentials({...configured, configuredRoleArn:'arn:aws:iam::1:role/Admin',fetcher:neverFetch}),/CONFIGURATION_REFUSED/)
})
test('different region denied before STS',async()=>{
  await assert.rejects(obtainPreviewCredentials({...configured,configuredRegion:'eu-north-1',fetcher:neverFetch}),/CONFIGURATION_REFUSED/)
})
test('missing OIDC denied before STS',async()=>{
  await assert.rejects(obtainPreviewCredentials({...configured,oidcToken:'',fetcher:neverFetch}),/OIDC_TOKEN_MISSING/)
})
test('normal OIDC flow only sends token to fixed STS endpoint; no secrets returned to logs',async()=>{
  let calls=0
  const fetcher=async(url,options)=>{
    calls++
    assert.equal(url,'https://sts.us-east-1.amazonaws.com/')
    assert.equal(options.method,'POST')
    assert.equal(options.cache,'no-store')
    const body=new URLSearchParams(options.body)
    assert.equal(body.get('RoleArn'),BEDROCK_PILOT_ROLE)
    assert.equal(body.get('Action'),'AssumeRoleWithWebIdentity')
    assert.equal(body.get('WebIdentityToken'),'test.jwt.here')
    assert.equal(body.get('DurationSeconds'),'900')
    return new Response('<AssumeRoleWithWebIdentityResponse><AssumedRoleUser><Arn>fake</Arn></AssumedRoleUser><Credentials><AccessKeyId>EXAMPLEKEY</AccessKeyId><SecretAccessKey>SECRET_DO_NOT_LOG</SecretAccessKey><SessionToken>SESSION_DO_NOT_LOG</SessionToken></Credentials></AssumeRoleWithWebIdentityResponse>',{status:200})
  }
  const credentials=await obtainPreviewCredentials({...configured,fetcher})
  assert.equal(credentials.accessKeyId,'EXAMPLEKEY')
  assert.equal(credentials.secretAccessKey,'SECRET_DO_NOT_LOG')
  assert.equal(credentials.sessionToken,'SESSION_DO_NOT_LOG')
  assert.equal(calls,1)
})
test('STS refusal generic, no raw error leakage',async()=>{
  const fetcher=async()=>new Response('<Error>raw AWS token or account identifier</Error>',{status:403})
  await assert.rejects(obtainPreviewCredentials({...configured,fetcher}),(e)=>{
    assert.equal(e.message,'BEDROCK_PILOT_STS_REFUSED');return true
  })
})
test('malformed STS credentials refused',async()=>{
  const fetcher=async()=>new Response('<AssumedRoleUser></AssumedRoleUser>',{status:200})
  await assert.rejects(obtainPreviewCredentials({...configured,fetcher}),/STS_RESPONSE_INVALID|STS_CREDENTIALS_MISSING/)
})
