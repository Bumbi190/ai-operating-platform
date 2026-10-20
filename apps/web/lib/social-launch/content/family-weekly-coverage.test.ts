import {describe,expect,it} from 'vitest'
import {buildFamilyWeekCoverage,FAMILY_WEEKLY_PROJECT_ID} from './family-weekly-coverage'
import type {SocialContentView,SocialContentPost} from './types'
import type {ScheduleWorkspaceView} from '../scheduling/store'
import {resolveStockholmSchedule} from '../scheduling/time'

const revision='e745041f-ad3a-493f-bd3b-025525d561b2'
function data(){
 const content:SocialContentView={
  project:{id:FAMILY_WEEKLY_PROJECT_ID,name:'Familje-Stunden',slug:'familje-stunden'},
  posts:[],assets:[],hasMoreAssets:false,planApproved:true,
  currentPlanRevisionId:revision,dispatchEnabled:false,publicationReady:false,
  workspaceUrl:'/projects/familje-stunden/social#content',
  plannedChannels:[
   {channel:'facebook',format:'text',cadence:'manual',purpose:'Families'},
   {channel:'instagram',format:'image',cadence:'manual',purpose:'Pictures'},
  ],
 }
 const schedule:ScheduleWorkspaceView={
  projectId:FAMILY_WEEKLY_PROJECT_ID,batches:[],releaseEvidence:[],
  monthlyRule:{dayOfMonth:1,localTime:'20:30',timeZone:'Europe/Stockholm',
   channels:['facebook','instagram'],enabled:true},
 }
 return {content,schedule,now:'2026-10-20T18:00:00.000Z',daysAhead:14 as const}
}
function post(channel:'facebook'|'instagram',when:string,status:SocialContentPost['status']='approved'):SocialContentPost{
 return {id:channel+'-post',status,requirements:[],decision:null,
  revision:{id:'revision-1',sequence:1,sha256:'a'.repeat(64),planRevisionId:revision,
   createdAt:'2026-10-20T00:00:00.000Z',media:channel==='instagram'?[{id:'image',kind:'image',sha256:'c'.repeat(64),mimeType:'image/jpeg',width:1080,height:1080}]:[],binding:null,
   draft:{channel,format:channel==='facebook'?'text':'image',title:'test',
    text:'grounded text',linkUrl:null,mediaIds:[],mediaBrief:'',scheduledAt:when},
  }}
}
describe('Atlas read-only Familje-Stunden weekly coverage audit',()=>{
 it('finds upcoming Tuesday/Friday and month 1 with correct Stockholm DST',()=>{
  const result=buildFamilyWeekCoverage(data())
  expect(result.summary.slots).toBe(8)
  expect(result.summary.missing).toBe(8)
  expect(result.slots.find(s=>s.localMinute==='2026-10-23T20:30')?.scheduledAt)
   .toBe('2026-10-23T18:30:00.000Z')
  expect(result.slots.find(s=>s.localMinute==='2026-10-27T17:00')?.scheduledAt)
   .toBe('2026-10-27T16:00:00.000Z')
  expect(result.slots.filter(s=>s.localMinute==='2026-11-01T20:30')).toHaveLength(2)
  expect(result.slots.filter(s=>s.kind==='month_release').every(s=>s.requiresReleaseEvidence)).toBe(true)
  expect(result.nextAction).toBe('prepare_missing_content_for_owner_review')
  expect(result.autonomousDraftingEnabled).toBe(false)
  expect(result.automaticPublishingEnabled).toBe(false)
  expect(result.costsIncurredByPlan).toBe(0)
 })
 it('prevents duplicate work for already covered editorial posts or exact queue jobs',()=>{
  const x=data(),fri=resolveStockholmSchedule('2026-10-23T20:30')
  x.content.posts.push(post('facebook',fri,'approved'))
  x.schedule.batches=[{
   projectId:FAMILY_WEEKLY_PROJECT_ID,batchId:'batch',revisionId:'r',sha256:'a'.repeat(64),
   status:'approved',version:1,approval:null,
   manifest:{projectId:FAMILY_WEEKLY_PROJECT_ID,items:[{
    postId:'queued-instagram',revisionId:'r',sha256:'a'.repeat(64),
    decisionId:'decision',planRevisionId:revision,bindingId:'binding',
    accountId:'account',channel:'instagram',asset:{id:'image',sha256:'b'.repeat(64)},
    localMinute:'2026-10-23T20:30',scheduledAt:fri,expiresAt:new Date(Date.parse(fri)+600000).toISOString(),
    occasionId:'occ',kind:'ordinary',releaseCondition:null,
   }]},
   jobs:[{id:'job',batchId:'batch',postId:'queued-instagram',channel:'instagram',
    scheduledAt:fri,expiresAt:new Date(Date.parse(fri)+600000).toISOString(),
    publicationId:null,reason:null,version:1,state:'queued'}],
  }]
  const result=buildFamilyWeekCoverage(x)
  expect(result.slots.find(s=>s.channel==='facebook'&&s.scheduledAt===fri)?.status).toBe('prepared')
  expect(result.slots.find(s=>s.channel==='instagram'&&s.scheduledAt===fri)?.status).toBe('in_queue')
  expect(result.summary.missing).toBe(6)
  expect(result.summary.queued).toBe(1)
 })
 it('stale schedule batch with obsolete plan cannot hide a real review gap',()=>{
  const x=data(),fri=resolveStockholmSchedule('2026-10-23T20:30')
  x.schedule.batches=[{
   projectId:FAMILY_WEEKLY_PROJECT_ID,batchId:'obsolete',revisionId:'old',sha256:'a'.repeat(64),
   status:'approved',version:1,approval:null,reviewCurrent:false,
   manifest:{projectId:FAMILY_WEEKLY_PROJECT_ID,items:[{
    postId:'old-post',revisionId:'old-revision',sha256:'a'.repeat(64),decisionId:'decision',
    planRevisionId:'outdated-plan',bindingId:'binding',accountId:'account',
    channel:'facebook',asset:{id:'image',sha256:'b'.repeat(64)},
    localMinute:'2026-10-23T20:30',scheduledAt:fri,
    expiresAt:new Date(Date.parse(fri)+600000).toISOString(),
    occasionId:'occasion',kind:'ordinary',releaseCondition:null,
   }]},
   jobs:[{id:'old-job',batchId:'obsolete',postId:'old-post',channel:'facebook',
    scheduledAt:fri,expiresAt:new Date(Date.parse(fri)+600000).toISOString(),
    publicationId:null,reason:null,version:1,state:'queued'}],
  }]
  const report=buildFamilyWeekCoverage(x)
  expect(report.slots.find(s=>s.channel==='facebook'&&s.scheduledAt===fri)?.status).toBe('needs_review')
  expect(report.summary.queued).toBe(0)
 })
 it('never claims a November release is ready just because a matching editorial post is approved',()=>{
  const x=data(),monthly=resolveStockholmSchedule('2026-11-01T20:30')
  x.content.posts.push(post('facebook',monthly))
  const value=buildFamilyWeekCoverage(x)
  expect(value.slots.find(s=>s.channel==='facebook'&&s.kind==='month_release'))
   .toMatchObject({status:'needs_review',requiresReleaseEvidence:true})
  expect(value.summary.needsReview).toBe(1)
 })
 it('ignores monthly rule when disabled and incomplete media when reviewing',()=>{
  const x=data()
  x.schedule.monthlyRule={...x.schedule.monthlyRule!,enabled:false}
  const day=resolveStockholmSchedule('2026-10-23T20:30')
  const image=post('instagram',day)
  image.revision.media=[]
  x.content.posts.push(image)
  const result=buildFamilyWeekCoverage(x)
  expect(result.slots.filter(s=>s.kind==='month_release')).toHaveLength(0)
  expect(result.slots.find(s=>s.channel==='instagram'&&s.scheduledAt===day)?.status).toBe('needs_review')
 })
 it('fails closed for wrong project, missing approved plan, tampered dates and external tenant',()=>{
  const valid=data()
  for(const mutate of [
   x=>{x.content.project.id='20000000-0000-4000-8000-000000000002'},
   x=>{x.schedule.projectId='20000000-0000-4000-8000-000000000002'},
   x=>{x.content.planApproved=false},
   x=>{x.content.plannedChannels[0].format='video'},
   x=>{x.now='invalid'},
  ] as Array<(x:ReturnType<typeof data>)=>void>){
   const x=data();mutate(x)
   expect(()=>buildFamilyWeekCoverage(x)).toThrow()
  }
 })
 it('never backfills the prior Tuesday after its time has passed',()=>{
  const x=data()
  const value=buildFamilyWeekCoverage(x)
  expect(value.slots.every(s=>Date.parse(s.scheduledAt)>Date.parse(x.now))).toBe(true)
  expect(value.slots.some(s=>s.localMinute==='2026-10-20T17:00')).toBe(false)
 })
})
