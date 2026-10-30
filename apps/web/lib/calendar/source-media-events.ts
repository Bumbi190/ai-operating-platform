import 'server-only';
import type {AdminDb,CalendarActor,CalendarRange,CalendarMediaEvents} from './types';
import {calendarId,parseCalendarRange} from './validate';
import {resolveCalendarLocal} from './time';
import {PLATFORM_SOCIAL_PROJECT_SLUG} from '../media/social-destination';
import {parsePromptQueueScripts,parsePromptQueueBindings} from './source-media-queue';
import {projectPromptCalendar} from './media-events';
export const emptyMediaEvents=(available=true):CalendarMediaEvents=>({entries:[],undated:[],available,truncated:false});
export async function readCalendarMediaEvents(db:AdminDb,actor:CalendarActor,input:CalendarRange,now=new Date().toISOString()):Promise<CalendarMediaEvents>{
 if(actor.projectScopeAvailable===false)return emptyMediaEvents(false);
 if(!actor.allowedProjectIds.length)return emptyMediaEvents();
 try{
  calendarId(actor.userId);actor.allowedProjectIds.forEach(calendarId);const range=parseCalendarRange(input);
  const owner=await db.from('projects').select('id,owner_id,slug').eq('owner_id',actor.userId).in('id',actor.allowedProjectIds).eq('slug',PLATFORM_SOCIAL_PROJECT_SLUG).limit(2);
  if(owner.error||!Array.isArray(owner.data)||owner.data.length>1)throw Error('Unavailable');
  if(!owner.data.length)return emptyMediaEvents();
  const p=owner.data[0];if(p.owner_id!==actor.userId||p.slug!==PLATFORM_SOCIAL_PROJECT_SLUG||!actor.allowedProjectIds.includes(p.id))throw Error('Unavailable');
  const columns='id,project_id,hook,status,video_status,generated_at,reviewed_at,published_at,instagram_media_id,facebook_post_id,youtube_video_id,publish_channel_state';
  const start=resolveCalendarLocal(range.fromDate+'T00:00'),end=resolveCalendarLocal(range.toDateExclusive+'T00:00');
  const filter=`and(published_at.gte.${start},published_at.lt.${end}),and(published_at.is.null,reviewed_at.gte.${start},reviewed_at.lt.${end}),and(published_at.is.null,reviewed_at.is.null,generated_at.gte.${start},generated_at.lt.${end})`;
  const base=()=>db.from('media_scripts').select(columns).eq('project_id',p.id).in('status',['approved','publishing','published']);
  const [dated,unknown,bindings]=await Promise.all([
   base().or(filter).order('generated_at',{ascending:false}).order('id',{ascending:true}).limit(101),
   base().is('published_at',null).is('reviewed_at',null).is('generated_at',null).order('id',{ascending:true}).limit(21),
   (db as any).from('social_account_bindings').select('platform,verification,blocked_at').eq('project_id',p.id).is('superseded_at',null).in('platform',['facebook','instagram','youtube']).limit(4)
  ]);
  if(dated.error||unknown.error)throw Error('Unavailable');
  const rows=parsePromptQueueScripts(dated.data,p.id),undated=parsePromptQueueScripts(unknown.data,p.id);
  if(undated.length>21)throw Error('Unavailable');
  for(const row of [...rows,...undated])for(const key of ['reviewed_at','published_at'] as const)if(row[key]!==null&&typeof row[key]!=='string')throw Error('Unavailable');
  const accounts=bindings.error?null:parsePromptQueueBindings(bindings.data);
  const result=projectPromptCalendar(p.id,[...rows.slice(0,100),...undated.slice(0,20)],accounts,range,now);
  return {...result,available:accounts!==null,truncated:rows.length>100||undated.length>20};
 }catch{return emptyMediaEvents(false);}
}
