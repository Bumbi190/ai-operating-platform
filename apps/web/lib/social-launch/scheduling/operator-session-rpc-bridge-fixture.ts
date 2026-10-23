import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import type {OperatorReviewNote} from './operator-review-ui-fixture'

// TEST ONLY. Private process/RPC adapter. An external trusted issuer supplies
// an ephemeral signed JWT; the signing key is NEVER accepted, imported,
// fetched or returned by this module. No browser route mounts this adapter.
//
// CRITICAL: decoding claims here does NOT verify the signature. The isolated
// PostgREST gateway verifies RS256 against its independently configured JWKS,
// and the SQL functions independently recheck project+active operator scope.
const origin='https://operator-review-fixture.invalid'
const issuer='omnira-schedule-fixture'
const kid='calendar-rpc-ephemeral-v1'
const operatorRole='social_schedule_operator_review_fixture'
const queueRole='social_schedule_broker_review_fixture'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const post=/^[0-9]{1,80}_[0-9]{1,80}$/
type Role=typeof operatorRole|typeof queueRole
export type OperatorScopedTokenRequest=Readonly<{
 role:Role;projectId:string;subject:string
}>
export type OperatorSessionRpcBridgeFixtureOptions={
 expectedProjectId:string
 // A trusted identity authority handles the private signer outside the UI.
 // Its response is consumed only in this private server process.
 issueScopedToken:(request:OperatorScopedTokenRequest)=>Promise<string>
 transport:typeof fetch
 now?:()=>number
}
const deny=():never=>{throw Error('OPERATOR_RPC_BRIDGE_DENIED')}
const unavailable=():never=>{throw Error('OPERATOR_RPC_BRIDGE_UNAVAILABLE')}
function exact(v:unknown,fields:readonly string[]):v is Record<string,unknown>{
 return !!v&&typeof v==='object'&&!Array.isArray(v)&&
  Object.keys(v).length===fields.length&&Object.keys(v).every(x=>fields.includes(x))
}
function tokenCheck(value:unknown,{role,projectId,subject}:OperatorScopedTokenRequest,now:number):string{
 if(typeof value!=='string'||value.length>8192)return deny()
 const pieces=value.split('.')
 if(pieces.length!==3||pieces.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))return deny()
 let header:Record<string,unknown>,claims:Record<string,unknown>
 try{
  header=JSON.parse(Buffer.from(pieces[0],'base64url').toString('utf8'))
  claims=JSON.parse(Buffer.from(pieces[1],'base64url').toString('utf8'))
 }catch{return deny()}
 if(!header||!claims||header.alg!=='RS256'||header.kid!==kid||
  header.typ!=='JWT'||claims.role!==role||claims.sub!==subject||
  claims.iss!==issuer||claims.aud!=='authenticated'||
  claims.omnira_project!==projectId||
  !Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||
  typeof claims.iat!=='number'||typeof claims.exp!=='number'||
  claims.iat>now+30||claims.iat<now-240||
  claims.exp<now+10||claims.exp>now+240||
  claims.exp-claims.iat>240||claims.exp<=claims.iat||
  claims.nbf!==undefined&&(
   !Number.isSafeInteger(claims.nbf)||typeof claims.nbf!=='number'||claims.nbf>now+30)
 )return deny()
 return value
}
export function createOperatorSessionRpcBridgeFixture(options:OperatorSessionRpcBridgeFixtureOptions){
 if(process.env.NODE_ENV!=='test'||!uuid.test(options.expectedProjectId)||
  typeof options.issueScopedToken!=='function'||typeof options.transport!=='function')deny()
 async function verifiedSubject(subject:string){
  if(!uuid.test(subject))deny()
  // The server re-verifies the current signed-in user; an identity supplied
  // via body/header or passed by another project cannot select the signer.
  const access=await resolveProjectAccess()
  if(!access.ok||access.userId!==subject||
   !access.allowedProjectIds.includes(options.expectedProjectId))deny()
  const operator=await resolvePlatformOperator()
  if(!operator.ok||operator.userId!==subject)deny()
 }
 async function rpc(
  role:Role,name:string,params:Record<string,unknown>,subject:string,
 ){
  const permitted=role===queueRole?
   name==='social_schedule_dispatch_review_fixture':
   ['social_schedule_operator_review_history_fixture',
    'social_schedule_operator_review_append_fixture'].includes(name)
  if(!permitted)deny()
  await verifiedSubject(subject)
  const target={role,subject,projectId:options.expectedProjectId}
  let token:string
  try{token=tokenCheck(await options.issueScopedToken(target),target,
    Math.floor((options.now?.()??Date.now())/1000))}
  catch{return deny()}
  // Internal loopback fixture origin only; the browser receives a sanitized
  // result from the existing session-checked UI handler, not this JWT.
  let response:Response
  try{
   response=await options.transport(origin+'/rpc/'+name,{
    method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
    body:JSON.stringify(params),redirect:'error',cache:'no-store',
   })
  }catch{return unavailable()}
  if(!response.ok)return deny()
  try{
   const bytes=await response.text()
   if(bytes.length>131072)return unavailable()
   return JSON.parse(bytes) as unknown
  }catch{return unavailable()}
 }
 return Object.freeze({
  readQueue:async(projectId:string,subject:string)=>{
   if(projectId!==options.expectedProjectId)deny()
   return rpc(queueRole,'social_schedule_dispatch_review_fixture',
    {p_project_id:projectId},subject)
  },
  readHistory:async(
   scope:{projectId:string;jobId:string;publicationId:string},subject:string,
  )=>{
   if(!exact(scope,['projectId','jobId','publicationId'])||
    scope.projectId!==options.expectedProjectId||
    !uuid.test(scope.jobId)||!uuid.test(scope.publicationId))deny()
   return rpc(operatorRole,'social_schedule_operator_review_history_fixture',{
    p_project_id:scope.projectId,p_job_id:scope.jobId,
    p_publication_id:scope.publicationId,
   },subject)
  },
  appendNote:async(note:OperatorReviewNote,subject:string)=>{
   if(!exact(note,['projectId','jobId','publicationId','requestId','observation','candidateId'])||
    note.projectId!==options.expectedProjectId||!uuid.test(note.jobId)||
    !uuid.test(note.publicationId)||!uuid.test(note.requestId)||
    !['possible_match_observed','no_match_observed','review_deferred'].includes(note.observation)||
    !(note.candidateId===null||typeof note.candidateId==='string'&&post.test(note.candidateId))||
    (note.observation==='possible_match_observed')!==(note.candidateId!==null))deny()
   return rpc(operatorRole,'social_schedule_operator_review_append_fixture',{
    p_input:{projectId:note.projectId,jobId:note.jobId,
     publicationId:note.publicationId,requestId:note.requestId,
     observation:note.observation,candidateId:note.candidateId},
   },subject)
  },
 })
}
