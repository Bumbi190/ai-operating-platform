import {describe,it,expect,vi,beforeEach} from 'vitest'
import {FAMILY_WEEKLY_PROJECT_ID as FAMILY} from './auto-preparation'

const state=vi.hoisted(()=>({
 runtime:true,runPipeline:vi.fn(async()=>({status:'review_ready',weekStart:'2027-01-04',
  modelCalls:1,publicationAuthority:false,noticeStored:true})),
 consent:vi.fn(async()=>({
  eventId:1,status:'owner_verified',projectId:'77cda551-57c9-4dc0-b019-1bb6438777f7',
  ownerId:'77777777-7777-4777-8777-777777777777',
  permittedOperation:'family_weekly_caption_drafts',validThrough:'2027-01-04T00:00:00Z',
 })),
 getContext:vi.fn(async()=>({status:'fake-context'})),
 runModel:vi.fn(async()=>{throw Error('DO NOT CALL PROVIDER IN WORKER TESTS')}),
}))
vi.mock('./enrollment',()=>({
 familyWeeklyRuntimeEnabled:()=>state.runtime,
 getVerifiedOwnerWeeklyEnrollment:state.consent,
}))
vi.mock('./enrollment-store',()=>({weeklyConsentReadPort:()=>({})}))
vi.mock('./paid-attempt-db',()=>({weeklyPaidAttemptDbPort:()=>({
 admitOnce:async()=>({status:'blocked'}),saveEditorialAtomically:async()=>null,
})}))
vi.mock('./review-notice-db',()=>({weeklyReviewNoticeWritePort:()=>({})}))
vi.mock('./service',()=>({getWeeklyContext:state.getContext}))
vi.mock('@/lib/ai/runner',()=>({runStep:state.runModel}))
vi.mock('./review-pipeline',()=>({prepareWeekForOwnerReview:state.runPipeline}))

import {parseClaimedFamilyRun,executeClaimedFamilyWeeklyRun} from './claimed-run-worker'

const OWNER='77777777-7777-4777-8777-777777777777'
const CONV='55555555-5555-4555-8555-555555555555'
const RUN='66666666-6666-4666-8666-666666666666'
const CLAIM='88888888-8888-4888-8888-888888888888'
const NOW='2027-01-03T14:12:00Z'
const fixture=()=>({
 id:RUN,project_id:FAMILY,status:'running',claim_id:CLAIM,
 kind:'family_weekly_editorial_drafts',workflow_id:null,
 idempotency_key:null,attempts:1,max_attempts:1,
 input:{ownerId:OWNER,conversationId:CONV,weekStart:'2027-01-04',eventId:1,
  source:'family_weekly_sunday_v1'},
})
const fakeDb=(data:unknown=true,error:unknown=null)=>({
 rpc:vi.fn(async(_name:string,_input:unknown)=>({data,error})),
})

describe('Dedicated claimed Family job handler never falls through to generic steps',()=>{
 beforeEach(()=>{
  vi.clearAllMocks()
  state.runtime=true
  state.consent.mockResolvedValue({
   eventId:1,status:'owner_verified',projectId:FAMILY,ownerId:OWNER,
   permittedOperation:'family_weekly_caption_drafts',
   validThrough:'2027-01-04T00:00:00Z',
  })
 })
 it('strictly parses native claimed run fields and null legacy idempotency',()=>{
  expect(parseClaimedFamilyRun(fixture())).toEqual({
   ownerId:OWNER,conversationId:CONV,runId:RUN,claimId:CLAIM,
   weekStart:'2027-01-04',eventId:1,
  })
  for(const changes of [
   {status:'pending'},{claim_id:null},{claim_id:'bad'},
   {kind:'marketing_channel_drafter'},{workflow_id:CONV},
   {idempotency_key:'old readable key'},{attempts:2},
   {max_attempts:3},{project_id:CONV},
   {input:{...fixture().input,source:'forged'}},
   {input:{...fixture().input,eventId:0}},
   {input:{...fixture().input,weekStart:'2027-01-05'}},
   {input:{...fixture().input,smtp:true}},
  ])expect(parseClaimedFamilyRun({...fixture(),...changes})).toBeNull()
 })
 it('runtime defaults fail-closed without reading a database or charging a model',async()=>{
  state.runtime=false
  const db=fakeDb()
  const out=await executeClaimedFamilyWeeklyRun(db as never,fixture(),NOW)
  expect(out).toMatchObject({status:'blocked',reason:'runtime_disabled',modelCalls:0})
  expect(db.rpc).not.toHaveBeenCalled()
  expect(state.runPipeline).not.toHaveBeenCalled()
  expect(state.runModel).not.toHaveBeenCalled()
 })
 it('the real SQL RPC must verify current project owner + run claim + week before continuation',async()=>{
  const db=fakeDb(true)
  const out=await executeClaimedFamilyWeeklyRun(db as never,fixture(),NOW)
  expect(out).toMatchObject({status:'review_ready',publicationAuthority:false})
  expect(db.rpc).toHaveBeenCalledTimes(1)
  expect(db.rpc).toHaveBeenCalledWith('family_weekly_authority_current',{
   p_owner_id:OWNER,p_run_id:RUN,p_claim_id:CLAIM,
   p_consent_event_id:1,p_conversation_id:CONV,p_week_start:'2027-01-04',
  })
  expect(state.runPipeline).toHaveBeenCalledTimes(1)
  const call=state.runPipeline.mock.calls[0] as unknown as any[]
  expect(call[0]).toMatchObject({owner:{userId:OWNER,allowedProjectIds:[FAMILY]},
   conversationId:CONV,run:{kind:'RUN_BOUND',runId:RUN,claimId:CLAIM,context:'AUTONOMOUS'}})
 })
 it('DB cannot establish run authority: refuse and never enter model pipeline',async()=>{
  for(const db of [fakeDb(false),fakeDb(null),fakeDb(true,{message:'DB_DOWN'})]){
   const out=await executeClaimedFamilyWeeklyRun(db as never,fixture(),NOW)
   expect(out).toMatchObject({status:'blocked',reason:'trusted_claim_unavailable',modelCalls:0})
  }
  expect(state.runPipeline).not.toHaveBeenCalled()
 })
 it('Sunday 15 Stockholm hour is required, and foreign week is rejected',async()=>{
  for(const now of ['2026-12-27T14:12:00Z','2027-01-03T15:05:00Z','2027-01-04T14:05:00Z']){
   const db=fakeDb()
   const out=await executeClaimedFamilyWeeklyRun(db as never,fixture(),now)
   expect(out).toMatchObject({status:'blocked',reason:'review_window_closed'})
   expect(db.rpc).not.toHaveBeenCalled()
  }
 })
 it('a relabelled/rotated claim cannot re-enter the provider',async()=>{
  const db=fakeDb()
  for(const row of [
   {...fixture(),claim_id:'not-a-uuid'},
   {...fixture(),idempotency_key:'a'.repeat(64)},
  ]){
   expect(await executeClaimedFamilyWeeklyRun(db as never,row,NOW)).toMatchObject({
    status:'blocked',reason:'claim_shape_invalid',
   })
  }
  expect(db.rpc).not.toHaveBeenCalled()
  expect(state.runModel).not.toHaveBeenCalled()
 })
 it('the drain route contains an explicit non-fallback branch for this kind',async()=>{
  const {readFileSync}=await import('node:fs')
  const {resolve}=await import('node:path')
  const route=readFileSync(resolve(__dirname,
   '../../../app/api/runs/drain/route.ts'),'utf8')
  expect(route).toContain("kind === 'family_weekly_editorial_drafts'")
  expect(route.indexOf("kind === 'family_weekly_editorial_drafts'")).toBeLessThan(route.indexOf('isWebsiteBuildRun(kind)'))
  expect(route).toContain('executeClaimedFamilyWeeklyRun(db, run)')
  expect(route).toContain('FAMILY_WEEKLY_REVIEW_NOT_READY')
 })
})
