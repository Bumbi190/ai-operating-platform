import type {SocialContentView} from './types'
import type {ScheduleWorkspaceView} from '../scheduling/store'
import {resolveStockholmSchedule} from '../scheduling/time'

export const FAMILY_WEEKLY_PROJECT_ID='77cda551-57c9-4dc0-b019-1bb6438777f7'
export type FamilyWeekGap={
 channel:'facebook'|'instagram'
 kind:'ordinary'|'month_release'
 localMinute:string
 scheduledAt:string
 status:'needs_content'|'needs_review'|'prepared'|'in_queue'|'published'
 postId:string|null
 requiresReleaseEvidence:boolean
}
type Input={content:SocialContentView;schedule:ScheduleWorkspaceView;now:string;daysAhead:7|14}

/** Deterministic coverage audit only. No AI generation, media access, writes, or dispatch. */
export function buildFamilyWeekCoverage({content,schedule,now,daysAhead}:Input){
 if(content.posts?.length>=100||schedule.batches?.length>=100)throw Error('FAMILY_WEEKLY_HISTORY_TRUNCATED')
 if(content.project.id!==FAMILY_WEEKLY_PROJECT_ID||content.project.slug!=='familje-stunden'||
  schedule.projectId!==FAMILY_WEEKLY_PROJECT_ID||!content.planApproved||
  !content.currentPlanRevisionId||!Array.isArray(content.posts)||!Array.isArray(schedule.batches)||
  ![7,14].includes(daysAhead))throw Error('FAMILY_WEEKLY_SOURCE_INVALID')
 const choices=new Map(content.plannedChannels.map(c=>[c.channel,c]))
 if(choices.size!==2||choices.get('facebook')?.format!=='text'||
  choices.get('facebook')?.cadence!=='manual'||choices.get('instagram')?.format!=='image'||
  choices.get('instagram')?.cadence!=='manual')throw Error('FAMILY_WEEKLY_PLAN_NOT_APPROVED')

 const time=Date.parse(now)
 if(!Number.isFinite(time)||new Date(time).toISOString()!==now)throw Error('FAMILY_WEEKLY_CLOCK_INVALID')
 const stockholm=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',
  year:'numeric',month:'2-digit',day:'2-digit'})
 const localDate=stockholm.format(new Date(time))
 const dayStart=new Date(localDate+'T00:00:00.000Z')
 if(!Number.isFinite(dayStart.getTime()))throw Error('FAMILY_WEEKLY_CLOCK_INVALID')
 const slots:FamilyWeekGap[]=[]
 const scheduledJobs=schedule.batches.filter(b=>b.projectId===FAMILY_WEEKLY_PROJECT_ID&&
    b.status!=='revoked').flatMap(b=>b.jobs.map(job=>{
      const item=b.manifest.items.find(item=>item.postId===job.postId)
      return {...job,kind:item?.kind,
        reviewCurrent:b.reviewCurrent!==false&&item?.planRevisionId===content.currentPlanRevisionId}
    }))
 for(let day=0;day<daysAhead;day++){
  const d=new Date(dayStart.getTime()+day*86400000)
  const dayDate=d.toISOString().slice(0,10)
  const monthly=d.getUTCDate()===1&&schedule.monthlyRule?.enabled===true
  const ordinaryDay=d.getUTCDay()===2||d.getUTCDay()===5
  if(!monthly&&!ordinaryDay)continue
  const clock=monthly?'20:30':d.getUTCDay()===2?'17:00':'20:30'
  const localMinute=dayDate+'T'+clock
  const scheduledAt=resolveStockholmSchedule(localMinute)
  if(Date.parse(scheduledAt)<=time)continue
  const kind=monthly?'month_release':'ordinary'
  for(const channel of ['facebook','instagram'] as const){
   // Always inspect only current revision: stale or rejected content cannot
   // silently satisfy a planning slot.
   const post=content.posts.find(p=>p.revision.draft.channel===channel&&
      p.revision.draft.scheduledAt===scheduledAt&&
      p.revision.planRevisionId===content.currentPlanRevisionId&&
      p.status!=='rejected')
   const queue=scheduledJobs.find(j=>j.channel===channel&&j.kind===kind&&
      j.scheduledAt===scheduledAt&&
      !['cancelled','failed','blocked','missed'].includes(j.state))
   let status:FamilyWeekGap['status']='needs_content'
   if(queue){status=!queue.reviewCurrent?'needs_review':queue.state==='published'?'published':'in_queue'}
   else if(post){
    const mediaOk=channel==='facebook'||post.revision.media.some(m=>m.kind==='image')
    status=post.status==='approved'&&mediaOk&&
      !post.requirements.includes('media_required')?'prepared':'needs_review'
   }
   // A monthly release without catalog/access evidence must never be
   // represented as ready or as scheduled only from a matching post.
   if(monthly && !queue && status==='prepared')status='needs_review'
   slots.push({channel,kind,localMinute,scheduledAt,status,
    postId:post?.id??null,requiresReleaseEvidence:monthly})
  }
 }
 const missing=slots.filter(s=>s.status==='needs_content')
 const review=slots.filter(s=>s.status==='needs_review')
 return {
  kind:'family_content_week_coverage_v1' as const,
  projectId:FAMILY_WEEKLY_PROJECT_ID,
  timeZone:'Europe/Stockholm' as const,asOf:now,daysAhead,
  planRevisionId:content.currentPlanRevisionId,
  summary:{slots:slots.length,missing:missing.length,needsReview:review.length,
   queued:slots.filter(s=>s.status==='in_queue').length,
   published:slots.filter(s=>s.status==='published').length},
  slots,
  nextAction:missing.length?'prepare_missing_content_for_owner_review':
    review.length?'owner_review_required':'no_missing_slots_detected',
  autonomousDraftingEnabled:false as const,
  automaticPublishingEnabled:false as const,
  costsIncurredByPlan:0 as const,
  note:'Read-only plan. Atlas may propose exact grounded drafts separately, but must never approve, schedule, spend or publish from this result.',
 }
}
