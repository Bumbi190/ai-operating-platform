import 'server-only';
import type {AdminDb,CalendarActor} from './types';
import {PLATFORM_SOCIAL_PROJECT_SLUG} from '../media/social-destination';
import {projectPromptQueue} from './media-queue-projection';
import {emptyMediaQueue,type CalendarMediaQueue,type PromptQueueScript,type PromptQueueBinding} from './media-queue-types';
const columns='id,project_id,hook,status,video_status,generated_at,instagram_media_id,facebook_post_id,youtube_video_id,publish_channel_state';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function parsePromptQueueScripts(value:unknown,projectId:string):PromptQueueScript[]{
 if(!Array.isArray(value)||value.length>101)throw Error('Invalid queue');
 for(const row of value){
  if(!row||typeof row.id!=='string'||!row.id||row.id.length>100||row.project_id!==projectId||!['approved','publishing','published'].includes(row.status))throw Error('Invalid queue');
  for(const key of ['hook','video_status','generated_at','instagram_media_id','facebook_post_id','youtube_video_id'])if(row[key]!==null&&typeof row[key]!=='string')throw Error('Invalid queue');
  for(const key of ['instagram_media_id','facebook_post_id','youtube_video_id'])if(row[key]?.length>200)throw Error('Invalid receipt');
  if(!row.publish_channel_state||typeof row.publish_channel_state!=='object'||Array.isArray(row.publish_channel_state)||Buffer.byteLength(JSON.stringify(row.publish_channel_state),'utf8')>16384)throw Error('Invalid observations');
 }
 return value as PromptQueueScript[];
}
export function parsePromptQueueBindings(value:unknown):PromptQueueBinding[]|null{
 if(!Array.isArray(value)||value.length>3)return null;
 const seen=new Set<string>();
 for(const row of value){if(!row||!['facebook','instagram','youtube'].includes(row.platform)||seen.has(row.platform)||!['provider_attested','runtime_evidence'].includes(row.verification)||row.blocked_at!==null&&(typeof row.blocked_at!=='string'||!Number.isFinite(Date.parse(row.blocked_at))))return null;seen.add(row.platform);}
 return value as PromptQueueBinding[];
}
export async function readCalendarMediaQueue(db:AdminDb,actor:CalendarActor,now=new Date().toISOString()):Promise<CalendarMediaQueue>{
 let projectId:string|null=null;
 if(actor.projectScopeAvailable===false)return emptyMediaQueue(false);
 if(!actor.allowedProjectIds.length)return emptyMediaQueue();
 try{
  if(!uuid.test(actor.userId)||actor.allowedProjectIds.some(id=>!uuid.test(id))||!Number.isFinite(Date.parse(now)))throw Error('Invalid scope');
  const owner=await db.from('projects').select('id,owner_id,slug').eq('owner_id',actor.userId).in('id',actor.allowedProjectIds).eq('slug',PLATFORM_SOCIAL_PROJECT_SLUG).limit(2);
  if(owner.error||!Array.isArray(owner.data)||owner.data.length>1)throw Error('Project unavailable');
  if(!owner.data.length)return emptyMediaQueue();
  const p=owner.data[0];if(p.owner_id!==actor.userId||p.slug!==PLATFORM_SOCIAL_PROJECT_SLUG||!actor.allowedProjectIds.includes(p.id))throw Error('Invalid project');
  projectId=p.id;
  const load=(statuses:string[],ascending:boolean)=>db.from('media_scripts').select(columns).eq('project_id',p.id).in('status',statuses).order('generated_at',{ascending}).order('id',{ascending:true}).limit(101);
  const [active,published,bound]=await Promise.allSettled([
   load(['approved','publishing'],true),load(['published'],false),
   (db as any).from('social_account_bindings').select('platform,verification,blocked_at').eq('project_id',p.id).is('superseded_at',null).in('platform',['facebook','instagram','youtube']).limit(4)
  ]);
  if(active.status!=='fulfilled'||published.status!=='fulfilled'||active.value.error||published.value.error)throw Error('Queue unavailable');
  const a=parsePromptQueueScripts(active.value.data,p.id),b=parsePromptQueueScripts(published.value.data,p.id);
  const accounts=bound.status==='fulfilled'&&!bound.value.error?parsePromptQueueBindings(bound.value.data):null;
  const items=projectPromptQueue([...a.slice(0,100),...b.slice(0,100)],accounts,now);
  return {projectId:p.id,available:accounts!==null,truncated:a.length>100||b.length>100||items.length>100,readAt:now,items:items.slice(0,100)};
 }catch{return emptyMediaQueue(false,projectId);}
}
