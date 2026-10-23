import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {listFacebookCandidates} from '../publication/reconciliation/provider'
import {ScheduledMetaEvidenceFixture} from '@/components/social-launch/ScheduledMetaEvidenceFixture'
import {createScheduledMetaEvidenceInspectorFixture} from './operator-meta-evidence-fixture'
import type {AttemptSnapshot} from '../publication/reconciliation/types'

const projectId='10000000-0000-4000-8000-000000000010'
const wrongProject='10000000-0000-4000-8000-000000000011'
const operatorId='20000000-0000-4000-8000-000000000010'
const jobId='30000000-0000-4000-8000-000000000010'
const postId='40000000-0000-4000-8000-000000000010'
const publicationId='50000000-0000-4000-8000-000000000010'
const revisionId='60000000-0000-4000-8000-000000000010'
const bindingId='70000000-0000-4000-8000-000000000010'
const token='private-test-only-account-token'
const endpoint='https://review-fixture.invalid/v1/facebook-evidence'
const created='2026-10-23T07:05:00Z'
const caption='Exakt bildtext med åäö'
function queue(state='published',other:Record<string,unknown>={}){
 return {projectId,automaticRetryAllowed:false,reviewAction:'operator_review_provider_evidence',pageLimit:25,items:[{
  jobId,publicationId,postId,reservedAt:'2026-10-23T07:04:45.000Z',
  databaseJobState:'published',publicationState:state,providerOutcome:'unknown',
  reviewStatus:'needs_authenticated_meta_evidence',automaticRetryAllowed:false,
 }],...other}
}
function snapshot(state:'published'|'uncertain'='published'):AttemptSnapshot{
 return {publication:{
  id:publicationId,projectId,postId,revisionId,sha256:'a'.repeat(64),
  decisionId:'80000000-0000-4000-8000-000000000010',
  bindingId,channel:'facebook',accountId:'12345',accountLabel:'Testkonto',
  state,version:4,containerId:null,providerId:null,permalink:null,
  failureCode:null,confirmation:null,requestedAt:'2026-10-23T07:04:00Z',
  updatedAt:'2026-10-23T07:04:30Z',authoritySource:'scheduled',jobId
 },revision:{
  id:revisionId,sequence:1,sha256:'a'.repeat(64),
  planRevisionId:'90000000-0000-4000-8000-000000000010',
  draft:{channel:'facebook',format:'image',title:'Syntetiskt inlägg',text:caption,
   linkUrl:null,mediaIds:['a0000000-0000-4000-8000-000000000010'],
   mediaBrief:'',scheduledAt:'2026-10-23T07:04:00Z'},
  media:[{id:'a0000000-0000-4000-8000-000000000010',kind:'image',
   mimeType:'image/jpeg',sha256:'b'.repeat(64)}],
  binding:{accountId:'12345',label:'Testkonto'},createdAt:'2026-10-23T07:02:00Z'
 } as AttemptSnapshot['revision']}
}
function rawPost(text=caption){
 return {id:'12345_67890',from:{id:'12345'},message:text,
  created_time:created,permalink_url:'https://www.facebook.com/12345/posts/67890',
  attachments:{data:[{type:'photo',target:{id:'888'},
   media:{image:{src:'https://scontent.fna.fbcdn.net/fixture.jpg'}}}]}}
}
function setup(overrides:Record<string,unknown>={}){
 const current=snapshot()
 const calls:{url:string;init:RequestInit}[]=[]
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{
  calls.push({url,init})
  return Response.json({data:[rawPost()]})
 }))
 const authenticateOperator=vi.fn(async(request:Request)=>
  request.headers.get('authorization')==='Bearer operator-session-verified-fixture'?
   {verified:true as const,isPlatformOperator:true as const,userId:operatorId,allowedProjectIds:[projectId]}:null)
 const readScopedQueue=vi.fn(async()=>queue())
 const readAttempt=vi.fn(async()=>current)
 const resolveCredential=vi.fn(async()=>({
  channel:'facebook' as const,projectId,bindingId,accountId:'12345',token,
  apiBase:'https://graph.facebook.com/v21.0',
 }))
 const deps={expectedProjectId:projectId,authenticateOperator,readScopedQueue,readAttempt,
  resolveCredential,provider:{list:listFacebookCandidates},...overrides}
 const inspector=createScheduledMetaEvidenceInspectorFixture(deps)
 const request=(body:Record<string,unknown>={})=>new Request(endpoint,{
  method:'POST',headers:{origin:'https://review-fixture.invalid',
   authorization:'Bearer operator-session-verified-fixture','content-type':'application/json'},
  body:JSON.stringify({projectId,jobId,publicationId,...body}),
 })
 return {inspector,deps,request,calls}
}
beforeEach(()=>vi.stubEnv('NODE_ENV','test'))
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})

it('uses an operator-only GET to Meta via the private credential and returns candidates, never confirmation or token',async()=>{
 const s=setup(),response=await s.inspector.handle(s.request())
 expect(response.status).toBe(200)
 expect(response.headers.get('cache-control')).toBe('no-store')
 const value=await response.json()
 expect(value).toMatchObject({
  projectId,jobId,publicationId,evidenceState:'candidate_needs_human_comparison',
  internalPublicationState:'published',providerOutcome:'unknown',
  source:'operator_requested_meta_get',operatorConfirmationRequired:true,
  automaticRetryAllowed:false,canFinalize:false,canPublish:false,
  limitedToFirst50:true,truncated:false,
 })
 expect(value.candidates).toHaveLength(1)
 expect(value.candidates[0]).toMatchObject({providerId:'12345_67890',photoId:'888',text:caption})
 expect(JSON.stringify(value)).not.toContain(token)
 expect(s.deps.readScopedQueue).toHaveBeenCalledTimes(2)
 expect(s.deps.readAttempt).toHaveBeenCalledTimes(1)
 expect(s.deps.resolveCredential).toHaveBeenCalledTimes(1)
 expect(s.calls).toHaveLength(1)
 expect(new URL(s.calls[0].url).pathname).toBe('/v21.0/12345/published_posts')
 expect(s.calls[0].init.method).toBe('GET')
 expect(new Headers(s.calls[0].init.headers).get('authorization')).toBe('Bearer '+token)
 expect(s.calls[0].url).not.toContain(token)
 const html=renderToStaticMarkup(createElement(ScheduledMetaEvidenceFixture,{evidence:value}))
 expect(html).toContain('Meta-resultatet är fortfarande overifierat')
 expect(html).toContain('12345/posts/67890')
 expect(html).not.toContain(token)
 expect(html).not.toContain('<button')
 expect(html).not.toContain('<form')
})

it('treats no matching Page posts as an unresolved uncertainty, not proof of no publication',async()=>{
 const s=setup()
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({data:[rawPost('Annan bildtext')]})))
 const r=await s.inspector.handle(s.request())
 expect(r.status).toBe(200)
 const result=await r.json()
 expect(result).toMatchObject({evidenceState:'no_candidate_observed',
  providerOutcome:'unknown',automaticRetryAllowed:false,canFinalize:false,
  candidates:[],limitedToFirst50:true})
 expect(result.manualInstruction).toContain('bevisar inte')
})

it('denies unauthenticated/nonoperator/foreign-project identities before any provider read',async()=>{
 const cases=[
  {authenticateOperator:vi.fn(async()=>null)},
  {authenticateOperator:vi.fn(async()=>({verified:true,isPlatformOperator:false,userId:operatorId,allowedProjectIds:[projectId]}))},
  {authenticateOperator:vi.fn(async()=>({verified:true,isPlatformOperator:true,userId:operatorId,allowedProjectIds:[wrongProject]}))},
  {authenticateOperator:vi.fn(async()=>({verified:true,isPlatformOperator:true,userId:'not-uuid',allowedProjectIds:[projectId]}))},
 ]
 for(const change of cases){
  const s=setup(change)
  const response=await s.inspector.handle(s.request())
  expect(response.status).toBe(403)
  expect(s.deps.readScopedQueue).not.toHaveBeenCalled()
  expect(s.calls).toHaveLength(0)
 }
})

it('refuses caller-selected publication/project, extra commands or invalid origin without touching provider',async()=>{
 const s=setup()
 for(const extra of [
  {publicationId:'50000000-0000-4000-8000-000000000099'},
  {jobId:'30000000-0000-4000-8000-000000000099'},
  {projectId:wrongProject},{providerId:'12345_67890'},
  {confirm:true},{operation:'publish'},
 ]){
  const response=await s.inspector.handle(s.request(extra))
  expect(response.status).toBe(403)
 }
 const wrongOrigin=new Request(endpoint,{method:'POST',
  headers:{origin:'https://evil.invalid','content-type':'application/json',
   authorization:'Bearer operator-session-verified-fixture'},
  body:JSON.stringify({projectId,jobId,publicationId})})
 expect((await s.inspector.handle(wrongOrigin)).status).toBe(403)
 expect(s.calls).toHaveLength(0)
})

it('denies mismatched stored publication/account/revision before the provider GET',async()=>{
 for(const mutation of [
  (x:AttemptSnapshot)=>{x.publication.projectId=wrongProject},
  (x:AttemptSnapshot)=>{x.publication.accountId='67890'},
  (x:AttemptSnapshot)=>{x.publication.bindingId='70000000-0000-4000-8000-000000000099'},
  (x:AttemptSnapshot)=>{x.publication.authoritySource='manual'},
  (x:AttemptSnapshot)=>{x.publication.jobId='30000000-0000-4000-8000-000000000099'},
  (x:AttemptSnapshot)=>{x.revision.draft.text=''},
  (x:AttemptSnapshot)=>{x.revision.draft.channel='instagram'},
 ]){
  const x=snapshot();mutation(x)
  const s=setup({readAttempt:vi.fn(async()=>x)})
  const response=await s.inspector.handle(s.request())
  expect(response.status).toBe(403)
  expect(s.calls).toHaveLength(0)
 }
 const s=setup({resolveCredential:vi.fn(async()=>({
  channel:'facebook',projectId:wrongProject,bindingId,accountId:'12345',token,apiBase:'https://graph.facebook.com/v21.0',
 }))})
 expect((await s.inspector.handle(s.request())).status).toBe(403)
 expect(s.calls).toHaveLength(0)
})

it('denies if scoped review is missing or changes while Meta GET is pending',async()=>{
 for(const [before,after,status] of [
  [queue('published',{items:[]}),queue(),403],
  [queue(),queue('published',{items:[]}),403],
  [queue(),queue('uncertain'),403],
  // A malformed trusted SQL response is a fail-closed dependency error.
  [queue(),queue('published',{projectId:wrongProject}),503],
 ] as const){
  const readScopedQueue=vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after)
  const s=setup({readScopedQueue})
  expect((await s.inspector.handle(s.request())).status).toBe(status)
 }
})

it('drops candidates if operator identity is revoked while the private Meta GET runs',async()=>{
 const auth=vi.fn()
  .mockResolvedValueOnce({verified:true,isPlatformOperator:true,
   userId:operatorId,allowedProjectIds:[projectId]})
  .mockResolvedValueOnce(null)
 const s=setup({authenticateOperator:auth})
 const response=await s.inspector.handle(s.request())
 expect(response.status).toBe(403)
 expect(s.calls).toHaveLength(1)
 expect(s.deps.readScopedQueue).toHaveBeenCalledTimes(1)
 expect(await response.text()).not.toContain('12345_67890')
})

it('fails closed on malformed injected provider candidate and never returns its URL',async()=>{
 const s=setup({provider:{list:vi.fn(async()=>[{
  id:'12345_67890',providerId:'12345_67890',accountId:'12345',createdAt:created,
  text:caption,photoId:'888',permalink:'https://www.facebook.com.evil.invalid/post',
  imageUrl:'https://scontent.fna.fbcdn.net/fixture.jpg',
 }])}})
 const r=await s.inspector.handle(s.request())
 expect(r.status).toBe(403)
 expect(await r.text()).not.toContain('evil.invalid')
 expect(s.calls).toHaveLength(0)
})

it('reports Meta read failure without leaking private credentials or claiming a final outcome',async()=>{
 const s=setup()
 vi.stubGlobal('fetch',vi.fn(async()=>{throw Error('synthetic provider outage '+token)}))
 const r=await s.inspector.handle(s.request())
 expect(r.status).toBe(503)
 const text=await r.text()
 expect(text).not.toContain(token)
 expect(text).not.toContain('published')
})

it('does not construct in a production environment',()=>{
 vi.stubEnv('NODE_ENV','production')
 expect(()=>setup()).toThrow()
})

const replayInput=process.env.OMNIRA_SCHEDULE_REPLAY_REVIEW_B64
const replayProject=process.env.OMNIRA_SCHEDULE_REPLAY_REVIEW_PROJECT
it.skipIf(!replayInput||!replayProject)('reads real isolated SQL queue result and performs private synthetic Meta GET without any write',async()=>{
 const q=JSON.parse(Buffer.from(replayInput!,'base64').toString('utf8'))
 const item=q.items?.[0]
 expect(item).toBeTruthy()
 const replaySnapshot=snapshot()
 replaySnapshot.publication.projectId=replayProject!
 replaySnapshot.publication.id=item.publicationId
 replaySnapshot.publication.jobId=item.jobId
 replaySnapshot.publication.postId=item.postId
 replaySnapshot.publication.state=item.publicationState
 const original=process.env.NODE_ENV
 vi.stubEnv('NODE_ENV','test')
 const s=setup({expectedProjectId:replayProject,
  authenticateOperator:vi.fn(async()=>({verified:true,isPlatformOperator:true,userId:operatorId,allowedProjectIds:[replayProject]})),
  readScopedQueue:vi.fn(async()=>q),
  readAttempt:vi.fn(async()=>replaySnapshot),
  resolveCredential:vi.fn(async()=>({channel:'facebook',projectId:replayProject,bindingId,accountId:'12345',token,apiBase:'https://graph.facebook.com/v21.0'})),
 })
 const request=new Request(endpoint,{method:'POST',headers:{
  origin:'https://review-fixture.invalid',authorization:'Bearer operator-session-verified-fixture',
  'content-type':'application/json',
 },body:JSON.stringify({projectId:replayProject,jobId:item.jobId,publicationId:item.publicationId})})
 const response=await s.inspector.handle(request)
 expect(response.status).toBe(200)
 const value=await response.json()
 expect(value).toMatchObject({internalPublicationState:'published',
  providerOutcome:'unknown',automaticRetryAllowed:false,canFinalize:false,
  evidenceState:'candidate_needs_human_comparison'})
 expect(s.calls).toHaveLength(1)
 expect(s.calls[0].init.method).toBe('GET')
 vi.stubEnv('NODE_ENV',original||'test')
})
