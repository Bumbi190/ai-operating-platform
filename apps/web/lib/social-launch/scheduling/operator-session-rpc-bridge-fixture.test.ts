import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {generateKeyPairSync,sign,verify} from 'node:crypto'
import {spawnSync} from 'node:child_process'

const state=vi.hoisted(()=>({
 signedIn:true,projectAllowed:true,operator:true,
 userId:'b6718615-5cf3-4833-bceb-2fb79cb53d9b',
 projectId:'8f673c09-1c8f-4d78-876e-4c14bf1c89b3',
 operatorChecks:0,revokeOn:0,
}))
vi.mock('@/lib/auth/project-access',()=>({
 resolveProjectAccess:async()=>state.signedIn?{
  ok:true,userId:state.userId,allowedProjectIds:state.projectAllowed?[state.projectId]:[],
 }:{ok:false,response:Response.json({},{status:401})},
}))
vi.mock('@/lib/auth/platform-operator',()=>({
 resolvePlatformOperator:async()=>{
  state.operatorChecks++
  return {ok:state.operator&&(!state.revokeOn||state.operatorChecks<state.revokeOn),
   userId:state.userId,email:'fixture@example.invalid'}
 },
}))
import {createOperatorSessionRpcBridgeFixture} from './operator-session-rpc-bridge-fixture'
import {createScheduledOperatorReviewUiFixture} from './operator-review-ui-fixture'

const {privateKey,publicKey}=generateKeyPairSync('rsa',{
 modulusLength:2048,publicExponent:0x10001,
})
const now=Date.now()
const epoch=Math.floor(now/1000)
const roleOperator='social_schedule_operator_review_fixture' as const
const roleReviewer='social_schedule_broker_review_fixture' as const
const jobId='30000000-0000-4000-8000-000000000010'
const publicationId='50000000-0000-4000-8000-000000000010'
const requestId='60000000-0000-4000-8000-000000000010'
const header={alg:'RS256',typ:'JWT',kid:'calendar-rpc-ephemeral-v1'}
const claims=(role:string,subject=state.userId,projectId=state.projectId)=>({
 role,sub:subject,omnira_project:projectId,iss:'omnira-schedule-fixture',
 aud:'authenticated',iat:epoch,exp:epoch+180,
})
function jwt(payload:Record<string,unknown>,hd:Record<string,unknown>={}){
 const parts=[{...header,...hd},payload]
  .map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')
 return parts+'.'+sign('RSA-SHA256',Buffer.from(parts),privateKey).toString('base64url')
}
const note={
 projectId:state.projectId,jobId,publicationId,requestId,
 observation:'review_deferred' as const,candidateId:null,
}
const scope={projectId:state.projectId,jobId,publicationId}
function setup(config:Record<string,unknown>={}){
 const calls:{url:string;init:RequestInit;role:string;body:any}[]=[]
 const issueScopedToken=vi.fn(async({role,subject,projectId}:{
  role:string;subject:string;projectId:string,
 })=>jwt(claims(role,subject,projectId)))
 const transport=vi.fn(async(url:string,init:RequestInit)=>{
  const token=new Headers(init.headers).get('authorization')?.replace(/^Bearer /,'')??''
  const pieces=token.split('.')
  const good=pieces.length===3&&
   verify('RSA-SHA256',Buffer.from(pieces[0]+'.'+pieces[1]),
    publicKey,Buffer.from(pieces[2],'base64url'))
  if(!good)return Response.json({code:'INVALID_SIGNATURE'},{status:401})
  const parsed=JSON.parse(Buffer.from(pieces[1],'base64url').toString('utf8'))
  const body=JSON.parse(String(init.body))
  calls.push({url,init,role:parsed.role,body})
  if(url.endsWith('/social_schedule_dispatch_review_fixture'))
   return Response.json({projectId:state.projectId,automaticRetryAllowed:false,
    reviewAction:'operator_review_provider_evidence',pageLimit:25,items:[]})
  if(url.endsWith('/social_schedule_operator_review_history_fixture'))
   return Response.json({...scope,providerOutcome:'unknown',automaticRetryAllowed:false,
    canFinalize:false,canPublish:false,limitReached:false,items:[]})
  if(url.endsWith('/social_schedule_operator_review_append_fixture'))
   return Response.json({eventId:1,observation:'review_deferred',
    evidenceClass:'human_observation_only',providerOutcome:'unknown',
    providerAttested:false,automaticRetryAllowed:false,canFinalize:false,canPublish:false})
  return Response.json({code:'NOT_FOUND'},{status:404})
 })
 const bridge=createOperatorSessionRpcBridgeFixture({
  expectedProjectId:state.projectId,issueScopedToken,transport,now:()=>now,...config,
 } as any)
 return {bridge,calls,transport,issueScopedToken}
}
beforeEach(()=>{
 vi.stubEnv('NODE_ENV','test')
 state.signedIn=true;state.projectAllowed=true;state.operator=true
 state.operatorChecks=0;state.revokeOn=0
 state.userId='b6718615-5cf3-4833-bceb-2fb79cb53d9b'
 state.projectId='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
})
afterEach(()=>vi.unstubAllEnvs())

it('proxies only three allowed scoped PostgREST RPCs without exposing JWTs or the signing key',async()=>{
 const s=setup()
 expect(Object.keys(s.bridge).sort()).toEqual(['appendNote','readHistory','readQueue'])
 expect((await s.bridge.readQueue(state.projectId,state.userId) as any).items).toEqual([])
 expect((await s.bridge.readHistory(scope,state.userId) as any).providerOutcome).toBe('unknown')
 expect((await s.bridge.appendNote(note,state.userId) as any).providerAttested).toBe(false)
 expect(s.issueScopedToken).toHaveBeenCalledTimes(3)
 expect(s.calls.map(x=>x.role)).toEqual([roleReviewer,roleOperator,roleOperator])
 expect(s.calls.map(x=>x.url)).toEqual([
  'https://operator-review-fixture.invalid/rpc/social_schedule_dispatch_review_fixture',
  'https://operator-review-fixture.invalid/rpc/social_schedule_operator_review_history_fixture',
  'https://operator-review-fixture.invalid/rpc/social_schedule_operator_review_append_fixture',
 ])
 expect(s.calls.every(x=>x.init.method==='POST'&&x.init.cache==='no-store'&&
  x.init.redirect==='error')).toBe(true)
 expect(s.calls[0].body).toEqual({p_project_id:state.projectId})
 expect(s.calls[1].body).toEqual({p_project_id:state.projectId,
  p_job_id:jobId,p_publication_id:publicationId})
 expect(s.calls[2].body).toEqual({p_input:note})
 expect(s.calls.every(x=>!JSON.stringify(x.body).includes('Bearer'))).toBe(true)
 expect((s.bridge as any).rpc).toBeUndefined()
 expect((s.bridge as any).sign).toBeUndefined()
 expect((s.bridge as any).issueScopedToken).toBeUndefined()
 expect((s.bridge as any).transport).toBeUndefined()
})

it('does not ask an issuer for a token when the verified session is missing, a non-operator, or out of scope',async()=>{
 for(const change of [
  {signedIn:false},{operator:false},{projectAllowed:false},
  {userId:'20000000-0000-4000-8000-000000000099'},
 ]){
  const s=setup()
  Object.assign(state,change)
  await expect(s.bridge.readQueue(state.projectId,
   'b6718615-5cf3-4833-bceb-2fb79cb53d9b')).rejects.toThrow('OPERATOR_RPC_BRIDGE_DENIED')
  expect(s.issueScopedToken).not.toHaveBeenCalled()
  expect(s.transport).not.toHaveBeenCalled()
  Object.assign(state,{signedIn:true,operator:true,projectAllowed:true,
   userId:'b6718615-5cf3-4833-bceb-2fb79cb53d9b'})
 }
 const s=setup()
 await expect(s.bridge.readQueue('10000000-0000-4000-8000-000000000010',state.userId))
  .rejects.toThrow('OPERATOR_RPC_BRIDGE_DENIED')
 expect(s.issueScopedToken).not.toHaveBeenCalled()
})

it('checks token role, subject, project, expiry, kid and asymmetric algorithm before the HTTP transport',async()=>{
 const altered=[
  [claims(roleOperator),{alg:'HS256'}],
  [claims(roleOperator),{kid:'unknown-key'}],
  [claims('service_role'),{}],
  [claims(roleReviewer,'20000000-0000-4000-8000-000000000099'),{}],
  [claims(roleReviewer,state.userId,'10000000-0000-4000-8000-000000000010'),{}],
  [{...claims(roleReviewer),iss:'evil'},{}],
  [{...claims(roleReviewer),aud:'service_role'},{}],
  [{...claims(roleReviewer),exp:epoch-1},{}],
  [{...claims(roleReviewer),exp:epoch+241},{}],
  [{...claims(roleReviewer),iat:epoch+90},{}],
  [{...claims(roleReviewer),nbf:epoch+90},{}],
 ] as const
 for(const [payload,head] of altered){
  const s=setup({issueScopedToken:async()=>jwt(payload,head)})
  await expect(s.bridge.readQueue(state.projectId,state.userId))
   .rejects.toThrow('OPERATOR_RPC_BRIDGE_DENIED')
  expect(s.transport).not.toHaveBeenCalled()
 }
 const s=setup({issueScopedToken:async()=> 'invalid.fake.jwt'})
 await expect(s.bridge.readQueue(state.projectId,state.userId))
  .rejects.toThrow('OPERATOR_RPC_BRIDGE_DENIED')
 expect(s.transport).not.toHaveBeenCalled()
})

it('fails closed on an altered signed token with valid-looking claims but invalid cryptographic proof at PostgREST',async()=>{
 const valid=jwt(claims(roleReviewer))
 const [h,p,signature]=valid.split('.')
 const forged=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(p,'base64url').toString('utf8')),extraTamperedClaim:'attacker'}))
  .toString('base64url')
 const altered=h+'.'+forged+'.'+signature
 const s=setup({issueScopedToken:async()=>altered})
 await expect(s.bridge.readQueue(state.projectId,state.userId))
  .rejects.toThrow('OPERATOR_RPC_BRIDGE_DENIED')
 expect(s.transport).toHaveBeenCalledTimes(1)
})

it('rejects extra action fields and arbitrary RPC expansion before signing or transport',async()=>{
 const s=setup()
 for(const invalid of [
  {...note,providerAttested:true},{...note,observation:'provider_confirmed'},
  {...note,candidateId:'999_777'}, {...note,requestId:'invalid'},
  {...note,projectId:'10000000-0000-4000-8000-000000000010'},
 ]){
  await expect(s.bridge.appendNote(invalid as any,state.userId))
   .rejects.toThrow('OPERATOR_RPC_BRIDGE_DENIED')
 }
 await expect(s.bridge.readHistory({...scope,jobId:'wrong'},state.userId))
  .rejects.toThrow('OPERATOR_RPC_BRIDGE_DENIED')
 expect(s.issueScopedToken).not.toHaveBeenCalled()
 expect(s.transport).not.toHaveBeenCalled()
})

it('rechecks the current project/operator session on every separate RPC request',async()=>{
 const s=setup()
 await s.bridge.readQueue(state.projectId,state.userId)
 state.operator=false
 await expect(s.bridge.readHistory(scope,state.userId))
  .rejects.toThrow('OPERATOR_RPC_BRIDGE_DENIED')
 expect(s.issueScopedToken).toHaveBeenCalledTimes(1)
 expect(s.transport).toHaveBeenCalledTimes(1)
})

it('does not leak credential or signed JWT through errors, and is disabled outside tests',async()=>{
 const secret='synthetic-private-token-not-leaked'
 const s=setup({transport:async()=>{throw Error(secret)}})
 await expect(s.bridge.readQueue(state.projectId,state.userId))
  .rejects.toThrow('OPERATOR_RPC_BRIDGE_UNAVAILABLE')
 const t=setup({transport:async()=>Response.json({leaked:secret},{status:403})})
 await expect(t.bridge.readQueue(state.projectId,state.userId))
  .rejects.toThrow('OPERATOR_RPC_BRIDGE_DENIED')
 vi.stubEnv('NODE_ENV','production')
 expect(()=>setup()).toThrow('OPERATOR_RPC_BRIDGE_DENIED')
})

// The trusted RS256 signer runs only in the *parent* replay process;
// this test receives already-signed short-lived role tokens, never a
// private key. A real PostgREST with public JWKS validates the signature.
const replayGateway=process.env.OMNIRA_SCHEDULE_REPLAY_GATEWAY
const replayReviewToken=process.env.OMNIRA_SCHEDULE_REPLAY_BRIDGE_REVIEW_TOKEN
const replayOperatorToken=process.env.OMNIRA_SCHEDULE_REPLAY_BRIDGE_OPERATOR_TOKEN
const replaySubject=process.env.OMNIRA_SCHEDULE_REPLAY_BRIDGE_SUBJECT
const replayScope=process.env.OMNIRA_SCHEDULE_REPLAY_BRIDGE_SCOPE_B64
it.skipIf(!replayGateway||!replayReviewToken||!replayOperatorToken||!replaySubject||!replayScope)(
 'proxies exact operator and review RPCs against the actual isolated PostgREST/JWKS without exposing signer',async()=>{
 const values=JSON.parse(Buffer.from(replayScope!,'base64').toString('utf8'))
 state.userId=replaySubject!
 state.projectId=values.projectId
 const issueScopedToken=vi.fn(async({role}:{
  role:string;subject:string;projectId:string,
 })=>role===roleReviewer?replayReviewToken!:replayOperatorToken!)
 const transport=vi.fn(async(url:string,init:RequestInit)=>{
  const q=Buffer.from(JSON.stringify({
   path:new URL(url).pathname,method:init.method,
   body:JSON.parse(String(init.body)),
   token:new Headers(init.headers).get('authorization')!.slice('Bearer '.length),
  })).toString('base64')
  const script=`const q=JSON.parse(Buffer.from(process.argv[1],'base64').toString());
    fetch('http://rest:3000'+q.path,{
      method:q.method,headers:{Authorization:'Bearer '+q.token,
        'Content-Type':'application/json'},body:JSON.stringify(q.body)
    }).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.text()})))
      .catch(e=>{console.error(e.message);process.exitCode=1})`
  const result=spawnSync('docker',['exec',replayGateway!,'node','-e',script,q],
   {encoding:'utf8',timeout:10000,maxBuffer:1024*1024})
  expect(result.status).toBe(0)
  const response=JSON.parse(result.stdout.trim())
  return new Response(response.body,{status:response.status,
   headers:{'content-type':'application/json'}})
 })
 const bridge=createOperatorSessionRpcBridgeFixture({
  expectedProjectId:values.projectId,issueScopedToken,
  transport:transport as unknown as typeof fetch,
 })
 const handler=createScheduledOperatorReviewUiFixture({
  expectedProjectId:values.projectId,
  readQueue:bridge.readQueue,readHistory:bridge.readHistory,appendNote:bridge.appendNote,
 })
 // Full session -> private broker -> signed JWT -> PostgREST path; replay
 // an existing request UUID to verify durable SQL idempotency (no third note).
 const userRequest=new Request('https://review-fixture.invalid/v1/operator-observation',{
  method:'POST',headers:{origin:'https://review-fixture.invalid',
   host:'review-fixture.invalid','content-type':'application/json'},
  body:JSON.stringify({operation:'record',...values,
   requestId:'590354a8-49db-4311-8d76-fc21caf5e954',
   observation:'no_match_observed',candidateId:null,
   confirmHumanObservation:true}),
 })
 const appResponse=await handler.handle(userRequest)
 expect(appResponse.status).toBe(200)
 const result=await appResponse.json()
 expect(result).toMatchObject({observationSaved:true,providerOutcome:'unknown',
  operatorRequired:true,automaticRetryAllowed:false,canFinalize:false,canPublish:false})
 expect(result.history).toHaveLength(2)
 expect(result.history.every((x:any)=>x.providerAttested===false)).toBe(true)
 expect(JSON.stringify(result)).not.toContain(replayOperatorToken!)
 expect(JSON.stringify(result)).not.toContain(replayReviewToken!)
 expect(transport).toHaveBeenCalledTimes(3)
 expect(issueScopedToken).toHaveBeenCalledTimes(3)
 expect(Object.keys(bridge).sort()).toEqual(['appendNote','readHistory','readQueue'])
 },45000)
