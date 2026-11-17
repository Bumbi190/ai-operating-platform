import {beforeAll,beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import {generateKeyPairSync,type KeyObject} from 'node:crypto'
import {SignJWT,jwtVerify} from 'jose'
import {NextRequest} from 'next/server'

const mocks=vi.hoisted(()=>({
 getToken:vi.fn(),context:vi.fn(),verify:vi.fn(),getUser:vi.fn(),db:vi.fn(()=>{throw Error('database forbidden')}),
 createAuth:vi.fn(),createSsr:vi.fn(),middlewareUser:vi.fn()
}))
vi.mock('@vercel/oidc',()=>({exchangeVercelOidcToken:mocks.getToken,getContext:mocks.context,verifyVercelOidcToken:mocks.verify}))
vi.mock('@supabase/supabase-js',()=>({createClient:mocks.createAuth}))
vi.mock('@supabase/ssr',()=>({createServerClient:mocks.createSsr}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{throw Error('admin/database forbidden')}}))

import {handleHarveyOidcPreflight,HARVEY_OIDC_PREFLIGHT_PATH,type PreflightDeps} from '../handlarborsen/lead-finder/webbuilder-oidc-preflight'
import {POST} from '../../app/api/atlas/handlarborsen/lead-finder/webbuilder-oidc-preflight/route'
import {middleware} from '../../middleware'
const host='ai-operating-platform-oidcfixture-bumbi190s-projects.vercel.app'
const origin='https://'+host
const sha='10f30e501557aab785574f73827602cea80d47c1'
const dpl='dpl_12345678901234567890123456789'
const branch='codex/atlas-harvey-sales-20261017'
const project='prj_ZwTfAGuJBW8iCjfSzBqx0Jwjz03T'
const owner='team_NlGVrs9ZItxkK4nMgRblBCI4'
const issuer='https://oidc.vercel.com/bumbi190s-projects'
const subject='owner:bumbi190s-projects:project:ai-operating-platform-web:environment:preview'
const baseEnv={HARVEY_OIDC_PREFLIGHT_ENABLED:'true',VERCEL:'1',VERCEL_ENV:'preview',
 VERCEL_TARGET_ENV:'preview',VERCEL_PROJECT_ID:project,VERCEL_GIT_COMMIT_REF:branch,
 VERCEL_GIT_COMMIT_SHA:sha,HARVEY_OIDC_PREFLIGHT_APPROVED_SHA:sha,VERCEL_URL:host,VERCEL_DEPLOYMENT_ID:dpl,
 NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-public-anon'}
const identity={deploymentId:dpl,host,branch,commit:sha}
const now=Math.floor(Date.now()/1000)
let keys:{publicKey:KeyObject;privateKey:KeyObject}
let foreign:{publicKey:KeyObject;privateKey:KeyObject}
let mutations:Record<string,unknown>
let lastToken:string
function request(body:unknown=identity,init:RequestInit={}){
 return new Request(origin+HARVEY_OIDC_PREFLIGHT_PATH,{method:'POST',
  headers:{origin,'content-type':'application/json',authorization:'Bearer fixture.session.signature'},
  body:JSON.stringify(body),...init})
}
function guardedEnv(changes:Record<string,string|undefined>={}){
 const values={...baseEnv,...changes}
 return new Proxy(values,{get(target,key){
  if(typeof key==='string'&&/SCB_API_KEY|PRIVATE_JWK|SERVICE_ROLE/.test(key))throw Error('secret read forbidden')
  return target[key as keyof typeof values]
 }})
}
const run=(r=request(),extra:PreflightDeps={})=>handleHarveyOidcPreflight(r,{env:guardedEnv(),now:()=>now*1000,...extra})
beforeAll(()=>{
 keys=generateKeyPairSync('rsa',{modulusLength:2048})
 foreign=generateKeyPairSync('rsa',{modulusLength:2048})
})
beforeEach(()=>{
 vi.clearAllMocks();mutations={};lastToken=''
 vi.stubGlobal('fetch',vi.fn(()=>{throw Error('unmocked network forbidden')}))
 mocks.context.mockReturnValue({headers:{'x-vercel-oidc-token':'synthetic-platform-context-proof'}})
 vi.stubEnv('PLATFORM_OPERATOR_EMAILS','operator@example.test')
 mocks.getUser.mockResolvedValue({data:{user:{id:'synthetic-owner',email:'operator@example.test'}},error:null})
 mocks.createAuth.mockReturnValue({auth:{getUser:mocks.getUser},from:mocks.db,rpc:mocks.db})
 mocks.middlewareUser.mockResolvedValue({data:{user:null}})
 mocks.createSsr.mockReturnValue({auth:{getUser:mocks.middlewareUser},from:mocks.db})
 mocks.getToken.mockImplementation(async(options:{audience:string;jti:string;skipCache:true})=>{
  const payload={iss:issuer,sub:subject,aud:options.audience,jti:options.jti,
   iat:now,exp:now+120,owner_id:owner,project_id:project,environment:'preview',...mutations}
  lastToken=await new SignJWT(payload).setProtectedHeader({alg:'RS256'}).sign(keys.privateKey)
  return lastToken
 })
 // Synthetic issuer adapter only. Real RSA/JWT cryptography; no real Vercel token or remote JWKS.
 mocks.verify.mockImplementation(async(token:string,options:Record<string,unknown>)=>{
  expect(options).toMatchObject({issuer,audience:expect.stringMatching(/^urn:omnira:harvey:oidc-preflight:v1:[a-f0-9]{64}$/),
   subject,projectId:project,ownerId:owner,environment:'preview',algorithms:['RS256'],maxTokenAge:'5m'})
  return jwtVerify(token,keys.publicKey,options as Parameters<typeof jwtVerify>[2])
 })
})
afterEach(()=>{expect(globalThis.fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();vi.unstubAllEnvs()})

describe('Harvey OIDC-only preflight, synthetic cryptographic proofs',()=>{
 it('accepts a fresh RSA-signed proof; no SCB, private key, database, token or user details in response',async()=>{
  const response=await run(),text=await response.text(),result=JSON.parse(text)
  expect(response.status).toBe(200)
  expect(result).toMatchObject({status:'PASS',oidc:{signature:'verified',maxAcceptedAgeSeconds:300,tokenLifetimeSeconds:120},
   deployment:{...identity,source:'runtime-compared-to-operator-expectation',
    tokenClaims:{deployment_id:'absent',deployment_url:'absent',git_commit_ref:'absent',git_commit_sha:'absent'}},
   scbCalled:false,p256Signed:false,businessDatabaseCalled:false})
  expect(text).not.toContain(lastToken)
  expect(text).not.toContain('operator@example.test')
  expect(text).not.toContain('fixture.session.signature')
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(response.headers.has('set-cookie')).toBe(false)
  expect(mocks.getUser).toHaveBeenCalledWith('fixture.session.signature')
  expect(mocks.getToken).toHaveBeenCalledWith(expect.objectContaining({token:'synthetic-platform-context-proof',skipCache:true}))
  expect(mocks.createAuth).toHaveBeenCalledWith(baseEnv.NEXT_PUBLIC_SUPABASE_URL,baseEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
   {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
  expect(mocks.db).not.toHaveBeenCalled()
  expect(mocks.createSsr).not.toHaveBeenCalled()
 })
 it('reports the platform two-hour maximum honestly, with separate five-minute freshness',async()=>{
  mutations.exp=now+7200
  expect(await (await run()).json()).toMatchObject({status:'PASS',oidc:{tokenLifetimeSeconds:7200,maxAcceptedAgeSeconds:300}})
 })
 it('matches optional signed identity claims when present',async()=>{
  mutations={deployment_id:dpl,deployment_url:host,git_commit_ref:branch,git_commit_sha:sha}
  expect(await (await run()).json()).toMatchObject({status:'PASS',deployment:{tokenClaims:{
   deployment_id:'matched',deployment_url:'matched',git_commit_ref:'matched',git_commit_sha:'matched'}}})
 })
 it.each([
  ['iss','https://evil.example'],['sub','wrong-subject'],['aud','wrong-audience'],['jti','wrong-nonce'],
  ['project_id','prj_other'],['owner_id','team_other'],['environment','production'],
  ['exp',now-1],['nbf',now+60],['exp',undefined],['iat',now-301],['iat',now+16],['iat',undefined],
  ['exp',now+7201],['deployment_id','dpl_wrong'],['deployment_url','wrong.vercel.app'],
  ['git_commit_ref','main'],['git_commit_sha','f'.repeat(40)],['deployment_id',null],
 ])('rejects invalid signed %s claim (%s)',async(field,value)=>{
  mutations[field]=value
  const r=await run()
  expect(r.status).toBe(503)
  expect(await r.json()).toEqual({scope:'harvey-oidc-preflight',status:'FAIL'})
  expect(mocks.db).not.toHaveBeenCalled()
 })
 it('rejects missing platform context without falling back to user headers, files or env tokens',async()=>{
  mocks.context.mockReturnValue({})
  const req=request(identity,{headers:{origin,'content-type':'application/json',authorization:'Bearer fixture.session.signature','x-vercel-oidc-token':'spoofed-request-proof'}})
  expect((await run(req)).status).toBe(503)
  expect(mocks.getToken).not.toHaveBeenCalled()
 })
 it('rejects a cryptographically manipulated token',async()=>{
  const original=mocks.getToken.getMockImplementation()!
  mocks.getToken.mockImplementation(async(o)=>{const t=await original(o);return t.slice(0,-8)+'aaaaaaaa'})
  expect((await run()).status).toBe(503)
 })
 it('rejects an issuer signature with an untrusted RSA key',async()=>{
  mocks.getToken.mockImplementation(async(o)=>new SignJWT({iss:issuer,aud:o.audience,sub:subject,jti:o.jti,
   iat:now,exp:now+120,project_id:project,owner_id:owner,environment:'preview'})
   .setProtectedHeader({alg:'RS256'}).sign(foreign.privateKey))
  expect((await run()).status).toBe(503)
 })
 it('rejects unsigned JWTs',async()=>{
  mocks.getToken.mockResolvedValue('eyJhbGciOiJub25lIn0.eyJzdWIiOiJmYWtlIn0.')
  expect((await run()).status).toBe(503)
 })
 it('uses a new audience and nonce each time; an old token cannot satisfy a new probe',async()=>{
  expect((await run()).status).toBe(200)
  const old=lastToken
  mocks.getToken.mockResolvedValue(old)
  expect((await run()).status).toBe(503)
  const [a,b]=mocks.getToken.mock.calls.map(c=>c[0])
  expect(a.jti).not.toBe(b.jti)
  expect(a.audience).not.toBe(b.audience)
 })
 it.each([
  ['HARVEY_OIDC_PREFLIGHT_ENABLED',undefined],['HARVEY_OIDC_PREFLIGHT_ENABLED','false'],
  ['VERCEL',undefined],['VERCEL_ENV','production'],['VERCEL_ENV','development'],
  ['VERCEL_TARGET_ENV','production'],['VERCEL_PROJECT_ID','prj_other'],
  ['VERCEL_GIT_COMMIT_REF','main'],['VERCEL_GIT_COMMIT_SHA','f'.repeat(40)],
  ['HARVEY_OIDC_PREFLIGHT_APPROVED_SHA',undefined],['VERCEL_URL','omniraos.se'],
  ['VERCEL_URL','ai-operating-platform-web-git-main-bumbi190s-projects.vercel.app'],
  ['VERCEL_DEPLOYMENT_ID',undefined]
 ])('disabled for invalid deployment configuration %s=%s',async(field,value)=>{
  const r=await run(request(),{env:guardedEnv({[field]:value})})
  expect(r.status).toBe(404)
  expect(mocks.createAuth).not.toHaveBeenCalled()
  expect(mocks.getToken).not.toHaveBeenCalled()
 })
 it.each(['deploymentId','host','commit','branch'])('rejects the wrong operator-expected %s before minting',async(field)=>{
  const r=await run(request({...identity,[field]:'wrong'}))
  expect(r.status).toBe(400)
  expect(mocks.getToken).not.toHaveBeenCalled()
 })
 it.each([
  ['no authorization',undefined],['wrong scheme','Basic abc'],['machine key','Bearer machine-secret']
 ])('rejects %s without auth/OIDC/database access',async(_name,authorization)=>{
  const headers:Record<string,string>={origin,'content-type':'application/json'}
  if(authorization)headers.authorization=authorization
  expect((await run(request(identity,{headers: Object.fromEntries(Object.entries(headers).filter((entry):entry is [string,string]=>typeof entry[1]==='string'))}))).status).toBe(403)
  expect(mocks.getUser).not.toHaveBeenCalled()
  expect(mocks.getToken).not.toHaveBeenCalled()
 })
 it.each([null,{id:'other',email:'other@example.test'},{id:'noemail'}, {email:'operator@example.test'}])('rejects non-operator or missing user %s',async(user)=>{
  mocks.getUser.mockResolvedValue({data:{user},error:null})
  expect((await run()).status).toBe(403)
  expect(mocks.getToken).not.toHaveBeenCalled()
 })
 it('fails closed with no configured operators',async()=>{
  vi.stubEnv('PLATFORM_OPERATOR_EMAILS','');vi.stubEnv('BREVO_ADMIN_EMAIL','')
  expect((await run()).status).toBe(403)
  expect(mocks.getToken).not.toHaveBeenCalled()
 })
 it('rejects Auth errors even when user data is also returned',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'owner',email:'operator@example.test'}},error:Error('secret')})
  expect((await run()).status).toBe(403)
 })
 it.each(['auth','mint','verify'])('does not disclose errors from %s',async(stage)=>{
  const logs=vi.spyOn(console,'error').mockImplementation(()=>{})
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{})
  const info=vi.spyOn(console,'log').mockImplementation(()=>{})
  try{
   const target=stage==='auth'?mocks.getUser:stage==='mint'?mocks.getToken:mocks.verify
   target.mockRejectedValue(Error('private-cookie-token-must-never-leak'))
   const r=await run()
   expect(r.status).toBe(503)
   expect(await r.text()).not.toContain('private-cookie-token')
   expect(logs).not.toHaveBeenCalled();expect(warn).not.toHaveBeenCalled();expect(info).not.toHaveBeenCalled()
  }finally{logs.mockRestore();warn.mockRestore();info.mockRestore()}
 })
 it.each([
  {origin:'https://evil.example','content-type':'application/json',authorization:'Bearer fixture.session.signature'},
  {'content-type':'application/json',authorization:'Bearer fixture.session.signature'},
 ])('rejects cross-site/missing Origin before authentication',async(headers)=>{
  expect((await run(request(identity,{headers:new Headers(Object.entries(headers).filter((entry):entry is [string,string]=>typeof entry[1]==="string"))}))).status).toBe(403)
  expect(mocks.getUser).not.toHaveBeenCalled();expect(mocks.getToken).not.toHaveBeenCalled()
 })
 it('rejects aliases, query strings, wrong path and non-POST methods',async()=>{
  for(const url of [origin+HARVEY_OIDC_PREFLIGHT_PATH+'?mode=live',origin+HARVEY_OIDC_PREFLIGHT_PATH+'/extra',
    'https://omniraos.se'+HARVEY_OIDC_PREFLIGHT_PATH]){
   expect((await run(new Request(url,{method:'POST',headers:{origin},body:'{}'}))).status).toBe(403)
  }
  expect((await run(new Request(origin+HARVEY_OIDC_PREFLIGHT_PATH,{headers:{origin}}))).status).toBe(405)
  expect(mocks.getToken).not.toHaveBeenCalled()
 })
 it.each([null,[],{}, {...identity,issuer:'https://evil.example'}, {...identity,commit:123}])('rejects malformed/unexpected body %s',async(body)=>{
  expect((await run(request(body))).status).toBe(400)
  expect(mocks.getToken).not.toHaveBeenCalled()
 })
 it('bounds unannounced/chunked bodies and never mints for oversized input',async()=>{
  const r=request(identity,{body:' '.repeat(1025)})
  expect((await run(r)).status).toBe(400)
  expect(mocks.getToken).not.toHaveBeenCalled()
 })
 it('runs the actual Next route wrapper with the same guarded handler',async()=>{
  for(const [key,value]of Object.entries(baseEnv))vi.stubEnv(key,value)
  const response=await POST(request())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({status:'PASS',scbCalled:false,businessDatabaseCalled:false})
  expect(mocks.db).not.toHaveBeenCalled()
 })
 it.each(['GET','POST','PUT'])('middleware delegates only the exact preflight path (%s) without Auth or database work',async(method)=>{
  await middleware(new NextRequest(origin+HARVEY_OIDC_PREFLIGHT_PATH,{method}))
  expect(mocks.createSsr).not.toHaveBeenCalled()
  expect(mocks.db).not.toHaveBeenCalled()
 })
 it.each([HARVEY_OIDC_PREFLIGHT_PATH+'/extra','/api/atlas/handlarborsen/lead-finder/webbuilder-scb-bridge'])('keeps normal middleware auth for %s',async(path)=>{
  await middleware(new NextRequest(origin+path))
  expect(mocks.createSsr).toHaveBeenCalledOnce()
  expect(mocks.middlewareUser).toHaveBeenCalledOnce()
 })
})
