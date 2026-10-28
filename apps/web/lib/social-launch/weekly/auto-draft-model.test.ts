import {describe,expect,it,vi} from 'vitest'
import type {RunStepInput,RunStepResult} from '@/lib/ai/runner'
import {
 buildWeeklyDraftPrompt,parseWeeklyDraftResponse,generateReviewOnlyWeeklyDrafts,
 WEEKLY_REVIEW_MODEL,WEEKLY_REVIEW_MODEL_CALLS,WEEKLY_REVIEW_OUTPUT_TOKEN_LIMIT,
} from './auto-draft-model'
import {FAMILY_WEEKLY_PROJECT_ID as FAMILY} from './auto-preparation'

vi.mock('@/lib/ai/runner',()=>({runStep:vi.fn(async()=>{throw Error('Real paid model must never run in unit tests')})}))

const owner='66666666-6666-4666-8666-666666666666'
const runId='77777777-7777-4777-8777-777777777777'
const claimId='88888888-8888-4888-8888-888888888888'
const img='99999999-9999-4999-8999-999999999999'
const hash='c'.repeat(64),profileSha='b'.repeat(64)
const now='2027-01-03T14:12:00Z'
const keys=['2027-01-05T17:00:ordinary','2027-01-08T20:30:ordinary']
const ctx=()=>({
 project:{id:FAMILY},
 contextHash:hash,
 plan:{weekStart:'2027-01-04',weekEndExclusive:'2027-01-11',existing:[],
  slots:[
   {key:keys[0],localMinute:'2027-01-05T17:00',scheduledAt:'2027-01-05T16:00:00Z',kind:'ordinary' as const,releaseMonth:null},
   {key:keys[1],localMinute:'2027-01-08T20:30',scheduledAt:'2027-01-08T19:30:00Z',kind:'ordinary' as const,releaseMonth:null},
  ],missing:[]},
 preparation:null,
 profile:{sha256:profileSha,profile:{description:'Barnfamiljer upptäcker sagor, pyssel och gemensamma aktiviteter'}},
 assets:[{id:img,description:'Nova och Pling läser en saga på en grön filt'}],
 sourceReferences:['profile:'+profileSha],
 missing:[],
})
const base=()=>({
 projectId:FAMILY,ownerId:owner,now,context:ctx(),
 run:{kind:'RUN_BOUND' as const,context:'AUTONOMOUS' as const,runId,claimId},
 verifiedEnrollment:{status:'owner_verified' as const,projectId:FAMILY,ownerId:owner,
  permittedOperation:'family_weekly_caption_drafts' as const,validThrough:'2027-01-04T00:00:00Z'},
})
const drafts=()=>keys.flatMap(slotKey=>['facebook','instagram'].map(channel=>({
 slotKey,channel,assetId:img,title:'En liten sagostund',
 text:'Nova och Pling visar vägen till en mysig stund med saga och pyssel. ✨ https://familje-stunden.se/',
 sourceReferences:['profile:'+profileSha],
})))
const modelResult=(value=JSON.stringify({drafts:drafts()})):RunStepResult=>({
 content:value,tokensIn:520,tokensOut:270,durationMs:80,
 stopReason:'stop',authorityRefreshRequired:false,
})
function model(){
 const calls:RunStepInput[]=[]
 return {
  calls,
  send:vi.fn(async(input:RunStepInput)=>{calls.push(input);return modelResult()}),
 }
}

describe('Familje-Stunden weekly governed caption proposal boundary',()=>{
 it('builds only short verified data and approved image IDs, not arbitrary assets',()=>{
  const request=buildWeeklyDraftPrompt(ctx(),keys)
  expect(request).toBeTruthy()
  const parsed=JSON.parse(request!.userMessage)
  expect(parsed).toMatchObject({project:'familje-stunden',weekStart:'2027-01-04',
   officialWebsite:'https://familje-stunden.se/',ordinarySlotKeys:keys})
  expect(parsed.ownedImages).toEqual([{id:img,description:'Nova och Pling läser en saga på en grön filt'}])
  expect(parsed).not.toHaveProperty('smtp')
  expect(parsed).not.toHaveProperty('approved')
  expect(request!.userMessage.length).toBeLessThan(4096)
 })
 it('accepts exactly one complete Facebook and Instagram set per missing slot',()=>{
  const out=parseWeeklyDraftResponse({
   output:JSON.stringify({drafts:drafts().reverse()}),allowedSlots:keys,allowedAssets:[img],
   sourceReferences:['profile:'+profileSha],stopReason:'stop',
  })
  expect(out).toHaveLength(4)
  expect(out?.map(o=>o.slotKey+'|'+o.channel).sort()).toEqual(keys.flatMap(k=>['facebook','instagram'].map(c=>k+'|'+c)).sort())
 })
 it.each([
  ['non-JSON', 'not json'],
  ['markdown code fences', String.fromCharCode(96,96,96)+'json\n{}\n'+String.fromCharCode(96,96,96)],
  ['missing set item', JSON.stringify({drafts:drafts().slice(1)})],
  ['unknown key', JSON.stringify({drafts:drafts().map((o,i)=>i?o:{...o,publish:true})})],
  ['unknown channel', JSON.stringify({drafts:drafts().map((o,i)=>i?o:{...o,channel:'youtube'})})],
  ['unknown asset', JSON.stringify({drafts:drafts().map((o,i)=>i?o:{...o,assetId:'unknown'})})],
  ['forged source', JSON.stringify({drafts:drafts().map((o,i)=>i?o:{...o,sourceReferences:['profile:'+'f'.repeat(64)]})})],
  ['duplicates', JSON.stringify({drafts:[drafts()[0],drafts()[0],drafts()[2],drafts()[3]]})],
  ['illegal promotion', JSON.stringify({drafts:drafts().map((o,i)=>i?o:{...o,text:'Gratis för alla, 100% garanti!'})})],
  ['external link', JSON.stringify({drafts:drafts().map((o,i)=>i?o:{...o,text:'Try this https://bad.example/'})})],
  ['hidden control', JSON.stringify({drafts:drafts().map((o,i)=>i?o:{...o,text:'Safe\u0000hidden'})})],
 ])('refuses %s, never producing partial draft candidates',(_label,value)=>{
  expect(parseWeeklyDraftResponse({output:value,allowedSlots:keys,allowedAssets:[img],
   sourceReferences:['profile:'+profileSha],stopReason:'stop'})).toBeNull()
 })
 it('rejects truncated model completions regardless of valid JSON',()=>{
  expect(parseWeeklyDraftResponse({output:JSON.stringify({drafts:drafts()}),
   allowedSlots:keys,allowedAssets:[img],sourceReferences:['profile:'+profileSha],stopReason:'length'})).toBeNull()
 })
 it('missing signed source/hash prevents prompt creation',()=>{
  expect(buildWeeklyDraftPrompt({...ctx(),contextHash:'bad'},keys)).toBeNull()
  expect(buildWeeklyDraftPrompt({...ctx(),assets:[]},keys)).toBeNull()
  expect(buildWeeklyDraftPrompt({...ctx(),profile:{sha256:profileSha,profile:{description:'x'.repeat(5000)}}},keys)).toBeNull()
 })
 it('never calls provider without verified owner enrollment and run claim',async()=>{
  for(const variation of [
   {verifiedEnrollment:null},
   {verifiedEnrollment:{...base().verifiedEnrollment,status:'unknown'}},
   {verifiedEnrollment:{...base().verifiedEnrollment,ownerId:'00000000-0000-4000-8000-000000000001'}},
   {verifiedEnrollment:{...base().verifiedEnrollment,validThrough:'2027-01-03T13:00:00Z'}},
   {run:{kind:'CONTRACT_ONLY',context:'AUTONOMOUS',runId,claimId}},
   {run:{kind:'RUN_BOUND',context:'OPERATOR_INTERACTIVE',runId,claimId}},
   {ownerId:'not-a-uuid'},
   {projectId:'00000000-0000-4000-8000-000000000001'},
  ]){
   const f=model()
   const r=await generateReviewOnlyWeeklyDrafts({...base(),...variation} as never,f.send)
   expect(r).toMatchObject({status:'blocked',modelCalls:0,publicationAuthority:false})
   expect(f.send).not.toHaveBeenCalled()
  }
 })
 it('respects scheduled Sunday window and already-prepared weeks',async()=>{
  for(const variation of [
   {now:'2026-12-27T14:00:00Z'},
   {now:'2027-01-04T14:00:00Z'},
   {context:{...ctx(),preparation:{preparationId:'already-saved'}}},
  ]){
   const f=model()
   const r=await generateReviewOnlyWeeklyDrafts({...base(),...variation} as never,f.send)
   expect(r).toMatchObject({status:'blocked',modelCalls:0})
   expect(f.send).not.toHaveBeenCalled()
  }
 })
 it('calls governed runner exactly once with real AUTONOMOUS project and hard model ceiling',async()=>{
  const f=model()
  const result=await generateReviewOnlyWeeklyDrafts(base(),f.send)
  expect(result).toMatchObject({status:'candidates_ready',modelCalls:1,
   weekStart:'2027-01-04',contextHash:hash,publicationAuthority:false,reviewRequired:true})
  expect(f.calls).toHaveLength(WEEKLY_REVIEW_MODEL_CALLS)
  const x=f.calls[0]
  expect(x).toMatchObject({
   model:WEEKLY_REVIEW_MODEL,maxTokens:WEEKLY_REVIEW_OUTPUT_TOKEN_LIMIT,
   execution:{context:'AUTONOMOUS',scope:{kind:'PROJECT',project:{projectId:FAMILY}}},
   cost:{projectId:FAMILY,operation:'family_weekly_caption_drafts'},
   authority:{kind:'RUN_BOUND',context:'AUTONOMOUS',claimId,runId},
  })
  expect(result.status==='candidates_ready'&&result.drafts).toHaveLength(4)
 })
 it('blocks unverified/stale result after one charge; never reports it as free',async()=>{
  const f=vi.fn(async()=>({...modelResult(),authorityRefreshRequired:true}))
  const r=await generateReviewOnlyWeeklyDrafts(base(),f)
  expect(r).toEqual({status:'blocked',reason:'model_result_unverified',
   modelCalls:1,publicationAuthority:false})
  expect(f).toHaveBeenCalledTimes(1)
 })
 it('does not fall back to another billable model when provider refuses',async()=>{
  const f=vi.fn(async()=>{throw new Error('SPEND_REFUSED')})
  await expect(generateReviewOnlyWeeklyDrafts(base(),f)).rejects.toThrow('SPEND_REFUSED')
  expect(f).toHaveBeenCalledTimes(1)
 })
 it('zero permission to persist, approve, notify or dispatch is returned',async()=>{
  const r=await generateReviewOnlyWeeklyDrafts(base(),model().send)
  for(const field of ['approval','send','publish','dispatch','schedule','notify','authorizedToWrite']){
   expect(r).not.toHaveProperty(field)
  }
 })
})
