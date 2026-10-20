import {describe,expect,it,vi} from 'vitest'
import {prepareFamilyReviewCandidates,stageFamilyReviewCandidates}
 from './family-weekly-preparation'
import {FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import type {SocialContentView,SocialContentPost} from './types'
import type {ScheduleWorkspaceView} from '../scheduling/store'
import {resolveStockholmSchedule} from '../scheduling/time'

const revision='e745041f-ad3a-493f-bd3b-025525d561b2'
const conversationId='20000000-0000-4000-8000-000000000002'
const principal={userId:'10000000-0000-4000-8000-000000000001',
 allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]}
function input(){
 const content:SocialContentView={
  project:{id:FAMILY_WEEKLY_PROJECT_ID,name:'Familje-Stunden',slug:'familje-stunden'},
  posts:[],assets:[],hasMoreAssets:false,planApproved:true,
  currentPlanRevisionId:revision,dispatchEnabled:false,publicationReady:false,
  workspaceUrl:'/projects/familje-stunden/social#content',
  plannedChannels:[
   {channel:'facebook',format:'text',cadence:'manual',purpose:'Vardagstips'},
   {channel:'instagram',format:'image',cadence:'manual',purpose:'Bilder'},
  ],
 }
 const schedule:ScheduleWorkspaceView={
  projectId:FAMILY_WEEKLY_PROJECT_ID,batches:[],releaseEvidence:[],
  monthlyRule:{dayOfMonth:1,localTime:'20:30',timeZone:'Europe/Stockholm',
   channels:['facebook','instagram'],enabled:true},
 }
 return {content,schedule,now:'2026-10-20T18:00:00.000Z'}
}
function existing(channel:'facebook'|'instagram',date:string):SocialContentPost{
 const time=resolveStockholmSchedule(date)
 return {
  id:channel+'-'+date,status:'approved',requirements:[],decision:null,
  revision:{
   id:'30000000-0000-4000-8000-000000000003',sequence:1,
   sha256:'d'.repeat(64),planRevisionId:revision,createdAt:'2026-10-20T00:00:00.000Z',
   binding:null,media:channel==='instagram'?[{id:'image',kind:'image',
    sha256:'e'.repeat(64),mimeType:'image/jpeg',width:1080,height:1080}]:[],
   draft:{channel,format:channel==='facebook'?'text':'image',
    title:'Already approved',text:'A previous published draft',mediaIds:[],
    mediaBrief:'',linkUrl:null,scheduledAt:time},
  },
 }
}
describe('Cost-free, grounded Familje-Stunden candidate preparation',()=>{
 it('prepares at most 4 review drafts with scheduled calendar intent, not released media',()=>{
  const plans=prepareFamilyReviewCandidates(input())
  expect(plans).toHaveLength(4)
  expect(plans.map(p=>p.draft.scheduledAt))
   .toEqual([resolveStockholmSchedule('2026-10-23T20:30'),
    resolveStockholmSchedule('2026-10-23T20:30'),
    resolveStockholmSchedule('2026-10-27T17:00'),
    resolveStockholmSchedule('2026-10-27T17:00')])
  expect(plans.every(p=>p.draft.linkUrl===null&&p.draft.mediaIds.length===0)).toBe(true)
  expect(plans.every(p=>p.expectedRevisionId===null&&p.planRevisionId===revision)).toBe(true)
  expect(plans.every(p=>p.draft.text.includes('Nova och Pling'))).toBe(true)
  expect(plans.filter(p=>p.requiresMediaReview)).toHaveLength(2)
  expect(plans.some(p=>p.draft.scheduledAt===resolveStockholmSchedule('2026-11-01T20:30'))).toBe(false)
 })
 it('skips existing October 23 posts and uses only the genuinely missing following slots',()=>{
  const x=input()
  x.content.posts.push(existing('facebook','2026-10-23T20:30'),
   existing('instagram','2026-10-23T20:30'))
  const plans=prepareFamilyReviewCandidates(x)
  expect(plans).toHaveLength(4)
  expect(plans[0].draft.scheduledAt).toBe(resolveStockholmSchedule('2026-10-27T17:00'))
  expect(plans[2].draft.scheduledAt).toBe(resolveStockholmSchedule('2026-10-30T20:30'))
 })
 it('same source and time always reuse exact post UUID and idempotency key',()=>{
  const p=prepareFamilyReviewCandidates(input())
  const again=prepareFamilyReviewCandidates(input())
  expect(again).toEqual(p)
  expect(new Set(p.map(x=>x.postId)).size).toBe(p.length)
  expect(new Set(p.map(x=>x.idempotencyKey)).size).toBe(p.length)
  expect(p.every(x=>/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(x.postId))).toBe(true)
  expect(p.every(x=>/^[A-Za-z0-9_-]{1,100}$/.test(x.idempotencyKey))).toBe(true)
 })
 it('never invents next month content, uses limited immutable October preview window',()=>{
  const x=input()
  x.now='2026-11-01T19:00:00.000Z'
  expect(prepareFamilyReviewCandidates(x)).toEqual([])
 })
 it('fails closed on changed plan or project and unreasonable batch cap',()=>{
  for(const change of [
   x=>{x.content.project.id='30000000-0000-4000-8000-000000000003'},
   x=>{x.content.currentPlanRevisionId='40000000-0000-4000-8000-000000000004'},
   x=>{x.content.planApproved=false},
   x=>{x.content.plannedChannels[0].format='video'},
   x=>{x.schedule.projectId='20000000-0000-4000-8000-000000000003'},
  ] as Array<(v:ReturnType<typeof input>)=>void>){
   const x=input();change(x)
   expect(()=>prepareFamilyReviewCandidates(x)).toThrow()
  }
  expect(()=>prepareFamilyReviewCandidates({...input(),maxDrafts:100})).toThrow('FAMILY_DRAFT_CAP_INVALID')
 })
 it('stages only review proposals through the injected existing RPC, zero publish actions',async()=>{
  const writes:any[]=[]
  const save=vi.fn(async(candidate)=>{writes.push(candidate);return {status:'proposal'}})
  const arg={...input(),principal,conversationId,save,maxDrafts:2}
  const receipt=await stageFamilyReviewCandidates(arg)
  expect(receipt).toMatchObject({created:2,canApprove:false,canPublish:false,
   aiGenerationCalls:0,needsImageOwnerReview:1})
  expect(writes).toHaveLength(2)
  expect(writes.every(w=>w.conversationId===conversationId&&
   w.projectId===FAMILY_WEEKLY_PROJECT_ID&&
   w.draft.mediaIds.length===0&&w.draft.scheduledAt&&w.expectedRevisionId===null)).toBe(true)
  await stageFamilyReviewCandidates(arg)
  expect(writes.slice(2)).toEqual(writes.slice(0,2))
 })
 it('does not persist after a first RPC failure or absent project authorization',async()=>{
  const save=vi.fn(async()=>{throw Error('EXACT_REVISION_CONFLICT')})
  await expect(stageFamilyReviewCandidates({...input(),principal,conversationId,save}))
   .rejects.toThrow('EXACT_REVISION_CONFLICT')
  expect(save).toHaveBeenCalledTimes(1)
  const missing={...principal,allowedProjectIds:[]}
  await expect(stageFamilyReviewCandidates({...input(),principal:missing,conversationId,save}))
   .rejects.toThrow('FAMILY_DRAFT_AUTHORIZATION_REQUIRED')
  expect(save).toHaveBeenCalledTimes(1)
 })
})
