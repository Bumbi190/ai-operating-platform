import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {ScheduledOperatorReviewPanelFixture} from '@/components/social-launch/ScheduledOperatorReviewPanelFixture'

const state=vi.hoisted(()=>({
 authenticated:true,operator:true,projectAllowed:true,operatorIdMatches:true,
 userId:'20000000-0000-4000-8000-000000000010',
 projectId:'10000000-0000-4000-8000-000000000010',operatorChecks:0,revokeAt:0,
}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.authenticated?
 {ok:true,userId:state.userId,
 allowedProjectIds:state.projectAllowed?[state.projectId]:[]}:
 {ok:false,response:Response.json({code:'UNAUTHORIZED'},{status:401})}}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:async()=>{
 state.operatorChecks++
 return {ok:state.operator&&(!state.revokeAt||state.operatorChecks<state.revokeAt),
  userId:state.operatorIdMatches?state.userId:'20000000-0000-4000-8000-000000000099'}
}}))

import {createScheduledOperatorReviewUiFixture} from './operator-review-ui-fixture'
import {prepareOperatorHistoryFixture} from './operator-review-history-fixture'
const projectId='10000000-0000-4000-8000-000000000010'
const jobId='30000000-0000-4000-8000-000000000010'
const publicationId='50000000-0000-4000-8000-000000000010'
const requestId='60000000-0000-4000-8000-000000000010'
const pathname='https://review-fixture.invalid/v1/operator-observation'
function queue(){
 return {projectId,automaticRetryAllowed:false,reviewAction:'operator_review_provider_evidence',
  pageLimit:25,items:[{
   jobId,publicationId,postId:'40000000-0000-4000-8000-000000000010',
   reservedAt:'2026-10-23T08:00:00.000Z',databaseJobState:'published',
   publicationState:'published',providerOutcome:'unknown',
   reviewStatus:'needs_authenticated_meta_evidence',automaticRetryAllowed:false,
  }]}
}
function event(observation='review_deferred',candidateId:string|null=null,
 operatorId=state.userId){
 return {eventId:1,operatorId,recordedAt:'2026-10-23T08:01:00.000Z',
  observation,candidateId,evidenceClass:'human_observation_only',providerAttested:false}
}
function history(items:unknown[]=[]){
 return {projectId,jobId,publicationId,providerOutcome:'unknown',
  automaticRetryAllowed:false,canFinalize:false,canPublish:false,
  limitReached:items.length===25,items}
}
function setup(overrides:Record<string,unknown>={}){
 const saved:ReturnType<typeof event>[]=[]
 const readQueue=vi.fn(async()=>queue())
 const readHistory=vi.fn(async()=>history([...saved]))
 const appendNote=vi.fn(async(input:Record<string,unknown>,operatorId:string)=>{
  if(!saved.length)saved.push(event(input.observation as string,input.candidateId as string|null,operatorId))
  return {eventId:1,observation:input.observation,evidenceClass:'human_observation_only',
   providerOutcome:'unknown',providerAttested:false,automaticRetryAllowed:false,
   canFinalize:false,canPublish:false}
 })
 const deps={expectedProjectId:projectId,readQueue,readHistory,appendNote,...overrides}
 const api=createScheduledOperatorReviewUiFixture(deps)
 const req=(body:Record<string,unknown>={},origin='https://review-fixture.invalid')=>
  new Request(pathname,{method:'POST',headers:{origin,host:'review-fixture.invalid',
   'content-type':'application/json'},
   body:JSON.stringify({operation:'read',projectId,jobId,publicationId,...body})})
 return {api,req,deps,saved}
}
beforeEach(()=>{
 vi.stubEnv('NODE_ENV','test')
 state.authenticated=true;state.operator=true;state.projectAllowed=true
 state.operatorIdMatches=true;state.operatorChecks=0;state.revokeAt=0
 state.userId='20000000-0000-4000-8000-000000000010'
 state.projectId='10000000-0000-4000-8000-000000000010'
})
afterEach(()=>vi.unstubAllEnvs())

it('only the real app session+operator guards may read human notes, and UI does not mark Meta verified',async()=>{
 const s=setup({readHistory:vi.fn(async()=>history([event()]))})
 const response=await s.api.handle(s.req())
 expect(response.status).toBe(200)
 const data=await response.json()
 expect(data).toMatchObject({publicationState:'published',providerOutcome:'unknown',
  automaticRetryAllowed:false,canPublish:false,canFinalize:false,
  observationSaved:false,operatorRequired:true})
 expect(data.history).toHaveLength(1)
 expect(data.history[0].observationLabel).toBe('Granskningen skjuts upp')
 expect(s.deps.appendNote).not.toHaveBeenCalled()
 const html=renderToStaticMarkup(createElement(ScheduledOperatorReviewPanelFixture,{
  initial:data,recordObservation:async()=>data,readHistory:async()=>data,
 }))
 expect(html).toContain('Tidigare observationer')
 expect(html).toContain('Meta-resultat: ej verifierat')
 expect(html).toContain('Granskningen skjuts upp')
 expect(html).toContain('Jag har själv gjort denna observation')
 expect(html).toContain('type="checkbox"')
 expect(html).toContain('Spara min granskningsnotering')
 expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit"|<button[^>]*type="submit"[^>]*disabled=""/)
 expect(html).not.toContain('Bekräfta publicering</button>')
})

it('records only confirmed human notes using signed session subject and reads committed history again',async()=>{
 const s=setup()
 const body={operation:'record',requestId,observation:'review_deferred',
  candidateId:null,confirmHumanObservation:true}
 const response=await s.api.handle(s.req(body))
 expect(response.status).toBe(200)
 const result=await response.json()
 expect(result.observationSaved).toBe(true)
 expect(result.history[0]).toMatchObject({observation:'review_deferred',
  operatorId:state.userId,evidenceClass:'human_observation_only',
  providerAttested:false})
 expect(result.providerOutcome).toBe('unknown')
 expect(s.deps.appendNote).toHaveBeenCalledWith({
  projectId,jobId,publicationId,requestId,observation:'review_deferred',candidateId:null,
 },state.userId)
 expect(s.deps.readHistory).toHaveBeenCalledTimes(1)
 expect(state.operatorChecks).toBeGreaterThanOrEqual(3)
})

it('never invokes privileged history or append for logged-out, mismatched and nonoperator users',async()=>{
 for(const change of [
  {authenticated:false},{operator:false},{projectAllowed:false},
  {operatorIdMatches:false},{userId:'not-a-uuid'},
 ]){
  const s=setup()
  Object.assign(state,change)
  const response=await s.api.handle(s.req())
  expect(response.status).toBe(403)
  expect(s.deps.readQueue).not.toHaveBeenCalled()
  expect(s.deps.readHistory).not.toHaveBeenCalled()
  expect(s.deps.appendNote).not.toHaveBeenCalled()
  Object.assign(state,{authenticated:true,operator:true,projectAllowed:true,
   operatorIdMatches:true,userId:'20000000-0000-4000-8000-000000000010'})
 }
})

it('requires same origin, confirmed human intent, and exact request allowlists',async()=>{
 const s=setup()
 for(const body of [
  {projectId:'10000000-0000-4000-8000-000000000099'},
  {publish:true},{actorId:state.userId},{providerAttested:true},
  {operation:'complete'},
  {operation:'record',requestId,observation:'review_deferred',
   candidateId:null,confirmHumanObservation:false},
  {operation:'record',requestId,observation:'possible_match_observed',
   candidateId:null,confirmHumanObservation:true},
  {operation:'record',requestId,observation:'provider_confirmed',
   candidateId:'12345_67890',confirmHumanObservation:true},
  {operation:'record',requestId,observation:'no_match_observed',
   candidateId:'12345_67890',confirmHumanObservation:true},
  {operation:'record',requestId:'bad-uuid',observation:'review_deferred',
   candidateId:null,confirmHumanObservation:true},
 ]){
  expect((await s.api.handle(s.req(body))).status).toBe(403)
 }
 expect((await s.api.handle(s.req({},'https://evil.test'))).status).toBe(403)
 expect(s.deps.readQueue).not.toHaveBeenCalled()
 expect(s.deps.appendNote).not.toHaveBeenCalled()
})

it('rechecks the platform operator identity immediately before a write',async()=>{
 const s=setup(),body={operation:'record',requestId,
  observation:'review_deferred',candidateId:null,confirmHumanObservation:true}
 state.revokeAt=2
 expect((await s.api.handle(s.req(body))).status).toBe(403)
 expect(s.deps.readQueue).toHaveBeenCalledTimes(1)
 expect(s.deps.appendNote).not.toHaveBeenCalled()
})

it('fails closed if SQL reports a forged attestation or cannot confirm the committed note',async()=>{
 const body={operation:'record',requestId,
  observation:'review_deferred',candidateId:null,confirmHumanObservation:true}
 const wrong=setup({appendNote:vi.fn(async()=>({
  eventId:1,observation:'review_deferred',evidenceClass:'human_observation_only',
  providerOutcome:'published',providerAttested:true,
  automaticRetryAllowed:true,canFinalize:true,canPublish:true,
 }))})
 expect((await wrong.api.handle(wrong.req(body))).status).toBe(503)
 const missing=setup({readHistory:vi.fn(async()=>history([]))})
 expect((await missing.api.handle(missing.req(body))).status).toBe(503)
 const olderMatch=setup({readHistory:vi.fn(async()=>history([{...event(),eventId:2}]))})
 expect((await olderMatch.api.handle(olderMatch.req(body))).status).toBe(503)
})

it('rejects forged historical provider proofs, injected extra fields and cross-project history',()=>{
 const scope={projectId,jobId,publicationId}
 for(const invalid of [
  {...history([event('review_deferred',null)]),extra:'forged'},
  history([event('provider_verified')]),
  history([event('possible_match_observed',null)]),
  history([event('review_deferred','12345_67890')]),
  history([event('review_deferred',null)]).items,
  {...history([event()]),providerOutcome:'published'},
  {...history([event()]),projectId:'10000000-0000-4000-8000-000000000099'},
  {...history([event()]),items:[{...event(),providerAttested:true}]},
  {...history([event()]),items:[{...event(),actorId:'attacker'}]},
  {...history([event()]),items:[event(),event()]},
 ]){
  expect(()=>prepareOperatorHistoryFixture(invalid,scope)).toThrow()
 }
})

it('does not construct an operator review endpoint outside test mode',()=>{
 vi.stubEnv('NODE_ENV','production')
 expect(()=>setup()).toThrow()
})

const replayHistory=process.env.OMNIRA_SCHEDULE_REPLAY_OPERATOR_HISTORY_B64
const replayScope=process.env.OMNIRA_SCHEDULE_REPLAY_OPERATOR_SCOPE_B64
it.skipIf(!replayHistory||!replayScope)('reads the real isolated signed PostgREST operator history and renders its unverified human-only notes',async()=>{
 const data=JSON.parse(Buffer.from(replayHistory!,'base64').toString('utf8'))
 const scope=JSON.parse(Buffer.from(replayScope!,'base64').toString('utf8'))
 const output=prepareOperatorHistoryFixture(data,scope)
 expect(output.entries).toHaveLength(2)
 expect(output.providerOutcome).toBe('unknown')
 expect(output.automaticRetryAllowed).toBe(false)
 expect(output.mayFinalize).toBe(false)
 expect(output.entries.every(x=>x.providerAttested===false)).toBe(true)
 const s=setup({expectedProjectId:scope.projectId,
  readQueue:vi.fn(async()=>({
   projectId:scope.projectId,automaticRetryAllowed:false,
   reviewAction:'operator_review_provider_evidence',pageLimit:25,
   items:[{jobId:scope.jobId,publicationId:scope.publicationId,
    postId:'40000000-0000-4000-8000-000000000010',
    reservedAt:'2026-10-23T08:00:00.000Z',databaseJobState:'published',
    publicationState:'published',providerOutcome:'unknown',
    reviewStatus:'needs_authenticated_meta_evidence',automaticRetryAllowed:false}],
  })),
  readHistory:vi.fn(async()=>data),
 })
 state.userId=output.entries[0].operatorId
 state.projectId=scope.projectId
 const request=new Request(pathname,{method:'POST',
  headers:{origin:'https://review-fixture.invalid',host:'review-fixture.invalid',
   'content-type':'application/json'},
  body:JSON.stringify({operation:'read',...scope})})
 const response=await s.api.handle(request)
 expect(response.status).toBe(200)
 const result=await response.json()
 expect(result.history).toHaveLength(2)
 expect(result.history.every((x:any)=>x.providerAttested===false)).toBe(true)
 expect(result.canFinalize).toBe(false)
})
