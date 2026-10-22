import {describe,it,expect,vi,beforeEach} from 'vitest'
vi.mock('../supabase/admin',()=>({createAdminClient:()=>{throw Error('not injected')}}))
import {createHiggsfieldOAuthDriver,createHiggsfieldOAuthService} from '../media/higgsfield/oauth'
import {openProviderPayload} from '../media/higgsfield/crypto'
const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',actorId='10000000-0000-4000-8000-000000000001'
const metadata={issuer:'https://clerk.higgsfield.ai',authorization_endpoint:'https://clerk.higgsfield.ai/oauth/authorize',token_endpoint:'https://clerk.higgsfield.ai/oauth/token',registration_endpoint:'https://clerk.higgsfield.ai/oauth/register',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],authorization_response_iss_parameter_supported:true}
function providerFetch(calls:Request[]) {
 return async(input:RequestInfo|URL,init?:RequestInit)=>{
  const req=new Request(input,init);calls.push(req.clone());const u=new URL(req.url)
  let body:unknown={}
  if(u.pathname.includes('oauth-protected-resource'))body={resource:'https://mcp.higgsfield.ai/mcp',authorization_servers:['https://clerk.higgsfield.ai'],scopes_supported:['openid','email','offline_access']}
  else if(u.pathname.includes('oauth-authorization-server'))body=metadata
  else if(u.pathname==='/oauth/register')body={client_id:'client-test',token_endpoint_auth_method:'none',redirect_uris:['https://omnira.example/api/media/higgsfield/oauth/callback']}
  else if(u.pathname==='/oauth/token')body={access_token:'private-access',refresh_token:'private-refresh',token_type:'Bearer',expires_in:3600,scope:'openid email offline_access'}
  else if(u.pathname.includes('openid-configuration'))body={...metadata,userinfo_endpoint:'https://clerk.higgsfield.ai/oauth/userinfo'}
  else if(u.pathname==='/oauth/userinfo')body={sub:'verified-subject'}
  else throw Error('Unexpected provider request '+u.pathname)
  return new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}})
 }
}
beforeEach(()=>{
 vi.stubEnv('HIGGSFIELD_MCP_ENABLED','true')
 vi.stubEnv('HIGGSFIELD_OAUTH_REDIRECT_URI','https://omnira.example/api/media/higgsfield/oauth/callback')
 vi.stubEnv('MEDIA_PROVIDER_OAUTH_ENCRYPTION_KEY',Buffer.alloc(32,7).toString('base64'))
})
describe('Higgsfield SDK OAuth',()=>{
 it('uses resource-bound issuer, S256, scoped registration and real code exchange',async()=>{
  const calls:Request[]=[];const driver=createHiggsfieldOAuthDriver(providerFetch(calls))
  const begun=await driver.begin('opaque-state','https://omnira.example/api/media/higgsfield/oauth/callback')
  const u=new URL(begun.authorizationUrl)
  expect(u.origin).toBe(metadata.issuer);expect(u.searchParams.get('state')).toBe('opaque-state')
  expect(u.searchParams.get('code_challenge_method')).toBe('S256')
  expect(u.searchParams.get('scope')).toBe('openid email offline_access')
  const result=await driver.finish(begun.payload,'code','https://omnira.example/api/media/higgsfield/oauth/callback',metadata.issuer)
  expect(result.subject).toBe('verified-subject')
  expect(result.payload.tokens?.access_token).toBe('private-access')
  expect(calls.some(r=>r.url==='https://mcp.higgsfield.ai/oauth2/token')).toBe(false)
  const exchange=calls.find(r=>r.url.endsWith('/oauth/token'))!
  const params=new URLSearchParams(await exchange.text())
  expect(params.get('grant_type')).toBe('authorization_code');expect(params.get('code_verifier')).toBeTruthy()
 })
 it.each(['invalid_grant','invalid_client'])('does not log or retry a rejected code exchange (%s)',async error=>{
  const calls:Request[]=[]
  const normal=providerFetch(calls)
  let exchanges=0
  const driver=createHiggsfieldOAuthDriver(async(input,init)=>{
   const req=new Request(input,init)
   if(new URL(req.url).pathname==='/oauth/token'){
    exchanges++
    return new Response(JSON.stringify({error,error_description:'SYNTHETIC_PROVIDER_SECRET'}),{status:400,headers:{'content-type':'application/json'}})
   }
   return normal(req)
  })
  const begun=await driver.begin('state','https://omnira.example/api/media/higgsfield/oauth/callback')
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{})
  try {
   await expect(driver.finish(begun.payload,'code','https://omnira.example/api/media/higgsfield/oauth/callback',metadata.issuer)).rejects.toThrow()
   expect(warn).not.toHaveBeenCalled()
   expect(exchanges).toBe(1)
  } finally {warn.mockRestore()}
 })
 it('rejects issuer mixup before sending the authorization code',async()=>{
  const calls:Request[]=[];const driver=createHiggsfieldOAuthDriver(providerFetch(calls))
  const begun=await driver.begin('state','https://omnira.example/api/media/higgsfield/oauth/callback')
  await expect(driver.finish(begun.payload,'code','https://omnira.example/api/media/higgsfield/oauth/callback','https://evil.example')).rejects.toThrow()
  expect(calls.filter(r=>r.url.endsWith('/oauth/token'))).toHaveLength(0)
 })
})
describe('durable OAuth service',()=>{
 it('consumes a denied attempt without any provider exchange',async()=>{
  const store={peekOAuthAttempt:async()=>({project_id:projectId}),consumeOAuthAttempt:async()=>({project_id:projectId,actor_id:actorId,connection_version:0}),readConnection:async()=>null} as never
  const driver={finish:vi.fn()} as never
  const svc=createHiggsfieldOAuthService(store,driver,async()=>true)
  expect((await svc.finish({state:'a'.repeat(43),actorId,error:'access_denied'})).code).toBe('access_denied')
  expect((driver as {finish:unknown}).finish).not.toHaveBeenCalled()
 })
 it('stores state hash and encrypted verifier instead of exposing secrets',async()=>{
  let saved:Record<string,unknown>={}
  const store={readConnection:async()=>null,createOAuthAttempt:async(input:Record<string,unknown>)=>{saved=input}} as never
  const driver={begin:async()=>({authorizationUrl:'https://clerk.higgsfield.ai/oauth/authorize',payload:{codeVerifier:'private-verifier'}})} as never
  const svc=createHiggsfieldOAuthService(store,driver,async()=>true)
  const result=await svc.begin({projectId,actorId})
  expect(JSON.stringify(result)).not.toContain('private-verifier')
  expect(String(saved.state_hash)).toMatch(/^[a-f0-9]{64}$/)
  expect(openProviderPayload({projectId,recordKind:'oauth',recordId:String(saved.state_hash)},saved.encrypted_payload)).toMatchObject({codeVerifier:'private-verifier'})
 })
 it('does not write credentials after a concurrent disconnect',async()=>{
  const store={peekOAuthAttempt:async()=>({project_id:projectId}),consumeOAuthAttempt:async()=>({project_id:projectId,actor_id:actorId,connection_version:0,encrypted_payload:{}}),readConnection:async()=>({connection_version:1,status:'disconnected'})} as never
  const driver={finish:vi.fn()} as never
  const svc=createHiggsfieldOAuthService(store,driver,async()=>true)
  expect((await svc.finish({state:'a'.repeat(43),actorId,code:'code'})).code).toBe('connection_changed')
  expect((driver as {finish:unknown}).finish).not.toHaveBeenCalled()
 })
})
