import {vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {publicationFixture} from '../publication/fixtures.test-utils'
import {proposeSocialContent,decideSocialContent} from '../content/store'
import {testSql} from '../../website-build/test-db'
import type {initializeSchedulingDb} from './test-db'
import type {ScheduleItem} from './types'
import {proposeSchedule} from './store'
import {resolveStockholmSchedule,monthlyReleaseSlot} from './time'
export function setScheduleClock(value:string|null){
 if(value!==null&&!Number.isFinite(Date.parse(value)))throw Error('Invalid test clock')
 testSql("create or replace function public.social_schedule_now() returns timestamptz language sql volatile security invoker set search_path='' as $$select "+(value?"'"+new Date(value).toISOString()+"'::timestamptz":"clock_timestamp()")+"$$;")
}
export async function scheduleFixture(db:ReturnType<typeof initializeSchedulingDb>,options:{channel?:'facebook'|'instagram';kind?:'ordinary'|'month_release';releaseMonth?:string;items?:ScheduleItem[]}={}){
 setScheduleClock(null)
 testSql("update platform_config set automation_paused=false;update social_schedule_jobs set state='cancelled',lease_expires_at=null where state in ('queued','claimed','waiting','blocked','missed');insert into auth.users(id) values('20000000-0000-4000-8000-000000000002') on conflict do nothing;")
 const source=await publicationFixture(db,options.channel??'facebook',true),kind=options.kind??'ordinary'
 let localMinute:string,scheduledAt:string
 if(kind==='month_release'){const slot=monthlyReleaseSlot(options.releaseMonth??'2026-11');localMinute=slot.localMinute;scheduledAt=slot.scheduledAt}
 else {
  const time=new Date(Math.ceil((Date.now()+120000)/60000)*60000),parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(time).map(p=>[p.type,p.value]))
  localMinute=parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute;scheduledAt=resolveStockholmSchedule(localMinute)
 }
 const content=await proposeSocialContent(db,source.p,{projectId:source.projectId,postId:source.postId,expectedRevisionId:source.post.revision.id,planRevisionId:source.post.revision.planRevisionId,idempotencyKey:randomUUID(),draft:{...source.post.revision.draft,scheduledAt}})
 const revision=content.posts[0].revision,approved=await decideSocialContent(db,source.p,{projectId:source.projectId,postId:source.postId,revisionId:revision.id,sha256:revision.sha256,decision:'approve',idempotencyKey:randomUUID()})
 const decision=approved.posts[0].decision!
 const item:ScheduleItem={postId:source.postId,revisionId:revision.id,sha256:revision.sha256,decisionId:decision.id,planRevisionId:revision.planRevisionId,bindingId:source.bindingId,accountId:source.accountId,channel:source.post.revision.draft.channel as 'facebook'|'instagram',asset:{id:source.assetId,sha256:source.assetSha},localMinute,scheduledAt,expiresAt:new Date(Date.parse(scheduledAt)+600000).toISOString(),occasionId:randomUUID(),kind,releaseCondition:kind==='month_release'?{releaseMonth:options.releaseMonth??'2026-11',catalogSha256:'e'.repeat(64)}:null}
 const manifest={projectId:source.projectId,items:options.items??[item]},principal=source.p
 vi.stubEnv('SOCIAL_SCHEDULE_DISPATCH_ENABLED','true');vi.stubEnv('SOCIAL_SCHEDULE_PROJECT_IDS',source.projectId)
 const batch=await proposeSchedule(db,principal,{projectId:source.projectId,manifest,expectedRevisionId:null,idempotencyKey:randomUUID()})
 return {principal,manifest,batch,approval:{projectId:source.projectId,batchId:batch.batchId,revisionId:batch.revisionId,sha256:batch.sha256,confirmed:true as const,idempotencyKey:randomUUID()},dueAt:scheduledAt,source:{...source,input:{...source.input,revisionId:revision.id,sha256:revision.sha256,decisionId:decision.id}}}
}

export async function appendScheduleFixtureItem(db:ReturnType<typeof initializeSchedulingDb>,f:Awaited<ReturnType<typeof scheduleFixture>>,changes:Partial<ScheduleItem>={}){
 const seed={...f.manifest.items[0],...changes},postId=randomUUID()
 const scheduledAt=resolveStockholmSchedule(seed.localMinute)
 const view=await proposeSocialContent(db,f.principal,{projectId:f.manifest.projectId,postId,expectedRevisionId:null,planRevisionId:seed.planRevisionId,idempotencyKey:randomUUID(),draft:{...f.source.post.revision.draft,title:'Nästa familjestund',text:'En annan granskad familjeaktivitet '+postId,scheduledAt}})
 const revision=view.posts.find(p=>p.id===postId)!.revision
 const approved=await decideSocialContent(db,f.principal,{projectId:f.manifest.projectId,postId,revisionId:revision.id,sha256:revision.sha256,decision:'approve',idempotencyKey:randomUUID()})
 return {...seed,postId,revisionId:revision.id,sha256:revision.sha256,decisionId:approved.posts.find(p=>p.id===postId)!.decision!.id,scheduledAt,expiresAt:new Date(Date.parse(scheduledAt)+600000).toISOString(),occasionId:changes.occasionId??randomUUID()}
}
