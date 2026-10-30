import 'server-only';
import type {AdminDb,CalendarActor,CalendarEntry,CalendarRange,CalendarTime} from './types';
import {readSocialContent} from '../social-launch/content/store';
import {readSchedules} from '../social-launch/scheduling/store';
import {monthlyPlanningSlots} from '../social-launch/scheduling/planning';
import type {SocialContentPost} from '../social-launch/content/types';
import type {ScheduleBatchView,ScheduleJob,ScheduleItem} from '../social-launch/scheduling/types';
import {resolveCalendarLocal,stockholmDate} from './time';
import {parseCalendarRange} from './validate';
export const CALENDAR_SOURCE_LIMIT=500;
export function calendarPoint(utc:string):CalendarTime{return {kind:'timed',startUtc:new Date(utc).toISOString(),endUtc:null,timeZone:'Europe/Stockholm'};}
export function calendarTimeInRange(time:CalendarTime,range:CalendarRange):boolean {
 if(time.kind==='all_day')return time.startDate<range.toDateExclusive&&time.endDateExclusive>range.fromDate;
 const a=resolveCalendarLocal(range.fromDate+'T00:00'),b=resolveCalendarLocal(range.toDateExclusive+'T00:00');
 return time.startUtc<b&&(time.endUtc===null?time.startUtc>=a:time.endUtc>a);
}
export function projectCalendarSocial(projectId:string,posts:SocialContentPost[],batches:ScheduleBatchView[],monthlyEnabled:boolean,href:string,range:CalendarRange):CalendarEntry[]{
 const repeatHeld=(post:SocialContentPost|undefined)=>!!post&&(!!post.repeatConflict||post.requirements.some(r=>['duplicate_content','similar_recent_content','repeat_history_unavailable','short_content_review'].includes(r)));
 const entries:CalendarEntry[]=[],byPost=new Map(posts.map(p=>[p.id,p]));
 const jobs=new Map<string,{job:ScheduleJob;batch:ScheduleBatchView;item:ScheduleItem}>();
 for(const batch of batches)for(const job of batch.jobs){
  const item=batch.manifest.items.find(i=>i.postId===job.postId);
  if(!item)continue;
  const old=jobs.get(job.postId);
  if(!old||(old.job.state==='cancelled'&&job.state!=='cancelled'))jobs.set(job.postId,{job,batch,item});
 }
 for(const [postId,{job,batch,item}] of jobs){
  const current=byPost.get(postId),revision=current?.revision;
  const approved=batch.review?.find(r=>r.item.postId===postId&&r.item.revisionId===item.revisionId)?.revision;
  const pending=revision&&revision.id!==item.revisionId&&revision.draft.scheduledAt?{time:calendarPoint(revision.draft.scheduledAt),reviewHref:href}:null;
  const status=repeatHeld(current)&&['queued','waiting','claimed'].includes(job.state)?'needs_review':job.state;
  entries.push({id:'social:'+projectId+':'+postId,contentSource:{kind:'social',projectId,postId,revisionId:item.revisionId,sha256:item.sha256,jobId:job.id},source:{kind:'social',projectId,postId,revisionId:revision?.id??item.revisionId,sha256:revision?.sha256??item.sha256,jobId:job.id},
   title:approved?.draft.title??'Publicering · '+job.channel,time:calendarPoint(job.scheduledAt),projectId,status,editable:!!revision,href,pendingChange:pending});
 }
 for(const post of posts){
  if(jobs.has(post.id)||!post.revision.draft.scheduledAt)continue;
  entries.push({id:'social:'+projectId+':'+post.id,source:{kind:'social',projectId,postId:post.id,revisionId:post.revision.id,sha256:post.revision.sha256,jobId:null},title:post.revision.draft.title,time:calendarPoint(post.revision.draft.scheduledAt),projectId,status:repeatHeld(post)?'needs_review':post.status==='rejected'?'rejected':'proposal',editable:true,href,pendingChange:null});
 }
 if(monthlyEnabled){
  const now=resolveCalendarLocal(range.fromDate+'T00:00');
  for(const slot of monthlyPlanningSlots(now,batches)){
   if(!['unprepared','partial'].includes(slot.status))continue;
   const releaseMonth=stockholmDate(slot.scheduledAt).slice(0,7);
   entries.push({id:'monthly:'+projectId+':'+releaseMonth,source:{kind:'monthly',projectId,releaseMonth},title:'Månadssläpp · innehåll saknas',time:calendarPoint(slot.scheduledAt),projectId,status:'content_missing',editable:false,href,pendingChange:null});
  }
 }
 return entries.filter(e=>calendarTimeInRange(e.time,range)||(e.pendingChange&&calendarTimeInRange(e.pendingChange.time,range)));
}
export async function readCalendarSocial(db:AdminDb,actor:CalendarActor,input:CalendarRange):Promise<{entries:CalendarEntry[];truncated:boolean;available:boolean}>{
 const range=parseCalendarRange(input);
 if(!actor.allowedProjectIds.length)return {entries:[],truncated:false,available:true};
 const results=await Promise.allSettled(actor.allowedProjectIds.slice(0,500).map(async projectId=>{
  const [content,schedule]=await Promise.all([readSocialContent(db,actor,{projectId}),readSchedules(db,actor,{projectId})]);
  return {entries:projectCalendarSocial(projectId,content.posts,schedule.batches,schedule.monthlyRule?.enabled===true,content.workspaceUrl,range),bounded:schedule.batches.length>=100};
 }));
 const entries=results.flatMap(r=>r.status==='fulfilled'?r.value.entries:[]);
 return {entries:entries.slice(0,CALENDAR_SOURCE_LIMIT),available:results.every(r=>r.status==='fulfilled'),truncated:actor.allowedProjectIds.length>500||entries.length>CALENDAR_SOURCE_LIMIT||results.some(r=>r.status==='fulfilled'&&r.value.bounded)};
}
