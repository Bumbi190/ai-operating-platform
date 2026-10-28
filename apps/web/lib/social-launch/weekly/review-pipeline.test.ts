import {describe,it,expect,vi} from 'vitest'
import {buildWeeklyReviewNotice,prepareWeekForOwnerReview} from './review-pipeline'
import {FAMILY_WEEKLY_PROJECT_ID as FAMILY} from './auto-preparation'

vi.mock('@/lib/ai/runner',()=>({runStep:vi.fn(async()=>{throw Error('NO REAL PROVIDER IN TESTS')})}))

const owner='66666666-6666-4666-8666-666666666666'
const conversationId='55555555-5555-4555-8555-555555555555'
const runId='77777777-7777-4777-8777-777777777777'
const claimId='88888888-8888-4888-8888-888888888888'
const img='99999999-9999-4999-8999-999999999999'
const savedId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const sha='b'.repeat(64),contextHash='c'.repeat(64)
const now='2027-01-03T14:10:00Z'
const slots=[
 {key:'2027-01-05T17:00:ordinary',localMinute:'2027-01-05T17:00',
  scheduledAt:'2027-01-05T16:00:00Z',kind:'ordinary',releaseMonth:null},
 {key:'2027-01-08T20:30:ordinary',localMinute:'2027-01-08T20:30',
  scheduledAt:'2027-01-08T19:30:00Z',kind:'ordinary',releaseMonth:null},
]
const input=()=>({
 owner:{userId:owner,allowedProjectIds:[FAMILY]},
 conversationId,now,run:{kind:'RUN_BOUND' as const,context:'AUTONOMOUS' as const,runId,claimId},
})
const consent=()=>({
 status:'owner_verified' as const,ownerId:owner,projectId:FAMILY,
 permittedOperation:'family_weekly_caption_drafts' as const,validThrough:'2027-01-05T00:00:00Z',
})
const context=()=>({
 project:{id:FAMILY},contextHash,
 plan:{weekStart:'2027-01-04',weekEndExclusive:'2027-01-11',
  existing:[],slots,missing:[]},
 profile:{sha256:sha,profile:{description:'Vi skapar sagor och pyssel för barnfamiljer'}},
 assets:[{id:img,description:'Nova och Pling läser en saga tillsammans'}],
 history:[],sourceReferences:['profile:'+sha],missing:[],preparation:null,
})
const generated=()=>slots.flatMap(s=>['facebook','instagram'].map(channel=>({
 slotKey:s.key,channel,assetId:img,title:'Sagor och pyssel',
 text:'En härlig stund med Nova och Pling. https://familje-stunden.se/',
 sourceReferences:['profile:'+sha],
})))
function fixture(){
 const stages:string[]=[]
 const save=vi.fn(async(_p:unknown,i:unknown)=>{
  stages.push('save')
  return {preparationId:savedId,status:'editorial_review_required',
   publicationAuthority:false,
   posts:generated(),
   workspaceUrl:'https://app.omniraos.se/projects/familje-stunden/social#content'}
 })
 const getEnrollment=vi.fn(async()=>{
  stages.push('enrollment')
  return consent()
 })
 const loadContext=vi.fn(async()=>{
  stages.push('context')
  return context()
 })
 const runModel=vi.fn(async()=>{
  stages.push('model')
  return {content:JSON.stringify({drafts:generated()}),
   stopReason:'stop',authorityRefreshRequired:false,
   tokensIn:120,tokensOut:300,durationMs:100}
 })
 return {stages,save,getEnrollment,loadContext,runModel,
  ports:{
   loadVerifiedEnrollment:getEnrollment,
   loadWeeklyContext:loadContext,
   saveForEditorialReview:save,
   runModel,
  }}
}

describe('Family weekly review pipeline: real controlled boundaries, no send',()=>{
 it('saves through native review-only writer and returns notice only AFTER saving',async()=>{
  const f=fixture()
  const r=await prepareWeekForOwnerReview(input(),f.ports as never)
  expect(r).toMatchObject({status:'review_ready',modelCalls:1,publicationAuthority:false,
   preparationId:savedId,
   notice:{kind:'familje-stunden-weekly-editorial-review',
    weekStart:'2027-01-04',count:4}})
  expect(f.stages).toEqual(['enrollment','context','model','enrollment','save'])
  expect(f.save).toHaveBeenCalledTimes(1)
  const saved=f.save.mock.calls[0][1] as Record<string,unknown>
  expect(saved).toMatchObject({projectId:FAMILY,conversationId,
   weekStart:'2027-01-04',generation:1,contextHash})
  expect(saved.idempotencyKey).toBe('weekly_20270104_'+contextHash.slice(0,24))
  expect((saved.drafts as unknown[]).length).toBe(4)
  expect(JSON.stringify(r)).not.toMatch(/"sendAllowed"|"publishAllowed"|"approved":true/)
 })
 it('rejects missing durable opt-in before any model or DB write',async()=>{
  const f=fixture()
  f.getEnrollment.mockResolvedValueOnce(null as never)
  const r=await prepareWeekForOwnerReview(input(),f.ports as never)
  expect(r).toMatchObject({status:'blocked',reason:'owner_enrollment_unavailable',modelCalls:0})
  expect(f.getEnrollment).toHaveBeenCalledTimes(1)
  expect(f.stages).toEqual([])
 })
 it('rejects foreign owners/projects or invalid claimed-run before database reads',async()=>{
  for(const bad of [
   {owner:{userId:owner,allowedProjectIds:[]}},
   {owner:{userId:'bad',allowedProjectIds:[FAMILY]}},
   {conversationId:'bad'},
   {run:{kind:'CONTRACT_ONLY',context:'AUTONOMOUS',runId,claimId}},
  ]){
   const f=fixture()
   expect(await prepareWeekForOwnerReview({...input(),...bad} as never,f.ports as never))
    .toMatchObject({status:'blocked',reason:'owner_or_run_unavailable',modelCalls:0})
   expect(f.stages).toEqual([])
  }
 })
 it('does not run early or on another weekday',async()=>{
  for(const date of ['2026-12-27T14:10:00Z','2027-01-04T14:10:00Z']){
   const f=fixture()
   const r=await prepareWeekForOwnerReview({...input(),now:date},f.ports as never)
   expect(r.status).toBe('blocked')
   expect(f.stages).toEqual([])
  }
 })
 it('refuses wrong source-scoped context before spending',async()=>{
  const f=fixture()
  f.loadContext.mockResolvedValueOnce({...context(),project:{id:'wrong'}} as never)
  const r=await prepareWeekForOwnerReview(input(),f.ports as never)
  expect(r).toMatchObject({status:'blocked',modelCalls:0})
  expect(f.getEnrollment).toHaveBeenCalledTimes(1)
  expect(f.loadContext).toHaveBeenCalledTimes(1)
  expect(f.stages).toEqual(['enrollment'])
 })
 it('will not save if owner consent was revoked during the billable model call',async()=>{
  const f=fixture()
  f.getEnrollment.mockResolvedValueOnce(consent())
  f.getEnrollment.mockResolvedValueOnce({...consent(),validThrough:'2027-01-02T00:00:00Z'} as never)
  const r=await prepareWeekForOwnerReview(input(),f.ports as never)
  expect(r).toMatchObject({status:'blocked',reason:'owner_enrollment_revoked',modelCalls:1})
  expect(f.save).not.toHaveBeenCalled()
  expect(f.getEnrollment).toHaveBeenCalledTimes(2)
  expect(f.stages).toEqual(['context','model'])
 })
 it('checks real elapsed time after the model before saving, even if consent row did not change',async()=>{
  const f=fixture()
  const spy=vi.spyOn(Date,'now').mockReturnValue(Date.parse('2027-01-06T01:00:00Z'))
  try{
   const r=await prepareWeekForOwnerReview(input(),f.ports as never)
   expect(r).toMatchObject({status:'blocked',reason:'owner_enrollment_revoked',modelCalls:1})
   expect(f.runModel).toHaveBeenCalledTimes(1)
   expect(f.save).not.toHaveBeenCalled()
  }finally{spy.mockRestore()}
 })
 it('rejects unverified model response without creating drafts',async()=>{
  const f=fixture()
  f.runModel.mockResolvedValueOnce({
   content:'not JSON',stopReason:'stop',authorityRefreshRequired:false,
   tokensIn:1,tokensOut:1,durationMs:1,
  })
  const r=await prepareWeekForOwnerReview(input(),f.ports as never)
  expect(r).toMatchObject({status:'blocked',modelCalls:1})
  expect(f.save).not.toHaveBeenCalled()
 })
 it('refuses missing or incorrect native save receipt without emitting a notice',async()=>{
  const f=fixture()
  f.save.mockResolvedValueOnce({status:'draft',preparationId:savedId,posts:generated()} as never)
  const r=await prepareWeekForOwnerReview(input(),f.ports as never)
  expect(r).toMatchObject({status:'blocked',reason:'review_receipt_unverified',modelCalls:1})
  expect(r).not.toHaveProperty('notice')
 })
 it('never creates a hyperlink to a foreign origin even if the receipt is tampered',()=>{
  const good={preparationId:savedId,status:'editorial_review_required',publicationAuthority:false,
   posts:generated(),workspaceUrl:'https://attack.example/phishing'}
  const n=buildWeeklyReviewNotice(good,'2027-01-04',4)
  expect(n?.workspaceUrl).toBe('https://app.omniraos.se/projects/familje-stunden/social#content')
  expect(n?.message).toContain('Ingenting är ännu godkänt')
  expect(buildWeeklyReviewNotice({...good,publicationAuthority:true},'2027-01-04',4)).toBeNull()
  expect(buildWeeklyReviewNotice({...good,posts:[]},'2027-01-04',4)).toBeNull()
 })
 it('never retries a provider budget refusal or writes a partial result',async()=>{
  const f=fixture()
  f.runModel.mockImplementationOnce(async()=>{throw Error('SPEND_REFUSED')})
  await expect(prepareWeekForOwnerReview(input(),f.ports as never)).rejects.toThrow('SPEND_REFUSED')
  expect(f.runModel).toHaveBeenCalledTimes(1)
  expect(f.save).not.toHaveBeenCalled()
 })
})
