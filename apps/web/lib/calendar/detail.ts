import 'server-only';
import {createHash} from 'node:crypto';
import type {AdminDb,CalendarActor,CalendarSourceRef,CalendarEntry} from './types';
import {CalendarError} from './types';
import {calendarFields,calendarId} from './validate';
import {readSocialContent} from '../social-launch/content/store';
import {readSchedules} from '../social-launch/scheduling/store';
import {resolveOwnedPreviewMedia,resolveLegacyScriptVideo} from '../review-content/owned-media';
import type {ReviewContent,ReviewMedia} from '../review-content/types';
import {normalizeReviewContent} from '../review-content/normalize';
import {projectPromptChannelStates} from './media-queue-projection';
import {parsePromptQueueScripts,parsePromptQueueBindings} from './source-media-queue';
import type {CalendarMediaChannelState} from './media-queue-types';
import {PLATFORM_SOCIAL_PROJECT_SLUG} from '../media/social-destination';
export type CalendarDetail={source:CalendarSourceRef;title:string;content:ReviewContent;channelStates?:CalendarMediaChannelState[];dateBasis?:CalendarEntry['dateBasis'];sourceHref:string|null;revisionHash:string|null};
export function parseDetailSource(value:unknown):Extract<CalendarSourceRef,{kind:'media'|'social'}>{
 calendarFields(value,['kind','projectId','scriptId','postId','revisionId','sha256','jobId']);calendarId(value.projectId);
 if(value.kind==='media'){calendarFields(value,['kind','projectId','scriptId']);calendarId(value.scriptId);return value as Extract<CalendarSourceRef,{kind:'media'}>;}
 if(value.kind==='social'){
  calendarFields(value,['kind','projectId','postId','revisionId','sha256','jobId']);calendarId(value.postId);calendarId(value.revisionId);if(value.jobId!==null)calendarId(value.jobId);
  if(typeof value.sha256!=='string'||!/^[a-f0-9]{64}$/.test(value.sha256))throw new CalendarError('INVALID_INPUT');return value as Extract<CalendarSourceRef,{kind:'social'}>;
 }
 throw new CalendarError('INVALID_INPUT');
}
export async function readCalendarDetail({adminDb:db}:{adminDb:AdminDb},actor:CalendarActor,input:CalendarSourceRef):Promise<CalendarDetail>{
 const source=parseDetailSource(input);calendarId(actor.userId);
 if(actor.projectScopeAvailable===false)throw new CalendarError('UNAVAILABLE');
 if(!actor.allowedProjectIds.includes(source.projectId))throw new CalendarError('NOT_FOUND');
 const {data:project,error}=await db.from('projects').select('id,owner_id,slug').eq('id',source.projectId).eq('owner_id',actor.userId).maybeSingle();
 if(error)throw new CalendarError('UNAVAILABLE');
 if(!project||project.id!==source.projectId||project.owner_id!==actor.userId)throw new CalendarError('NOT_FOUND');
 if(source.kind==='media'){
  if(project.slug!==PLATFORM_SOCIAL_PROJECT_SLUG)throw new CalendarError('NOT_FOUND');
  const {data:s,error}=await db.from('media_scripts').select('id,project_id,hook,script,cta,status,video_status,generated_at,reviewed_at,published_at,instagram_media_id,facebook_post_id,youtube_video_id,publish_channel_state,video_url,render_id,render_bucket').eq('id',source.scriptId).eq('project_id',source.projectId).in('status',['approved','publishing','published']).maybeSingle();
  if(error)throw new CalendarError('UNAVAILABLE');if(!s||s.id!==source.scriptId||s.project_id!==source.projectId)throw new CalendarError('NOT_FOUND');
  const row=parsePromptQueueScripts([s],source.projectId)[0];
  const bound=await (db as any).from('social_account_bindings').select('platform,verification,blocked_at').eq('project_id',source.projectId).is('superseded_at',null).in('platform',['facebook','instagram','youtube']).limit(4);
  const channelStates=projectPromptChannelStates(row,bound.error?null:parsePromptQueueBindings(bound.data),new Date().toISOString());
  const text=[s.script,s.cta].filter(v=>typeof v==='string'&&v.trim()).join('\n\n');const normalized=normalizeReviewContent({kind:null,outputKey:null,content:text});
  const media:ReviewMedia[]=[];
  const legacy=resolveLegacyScriptVideo({scriptId:s.id,videoUrl:s.video_url,renderId:s.render_id,bucket:s.render_bucket,region:process.env.AWS_REGION??'eu-north-1',configuredBucket:process.env.REMOTION_S3_BUCKET});
  if(legacy)media.push(legacy);
  else if(typeof s.video_url==='string'){
   try{
    const url=new URL(s.video_url),origin=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??'');
    if(url.origin===origin.origin&&url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash){
     const match=/^\/storage\/v1\/object\/public\/(media-assets(?:-private)?)\/(.+)$/.exec(url.pathname);
     if(match){const path=decodeURIComponent(match[2]);const {data:asset,error}=await db.from('assets').select('id,checksum_sha256,mime_type').eq('project_id',source.projectId).eq('storage_bucket',match[1]).eq('storage_path',path).maybeSingle();
      if(!error&&asset){const preview=await resolveOwnedPreviewMedia(db,actor,source.projectId,{assetId:asset.id,sha256:asset.checksum_sha256,name:'Nyhetsfilm',mimeType:asset.mime_type});if(preview?.kind==='video')media.push(preview);}
     }
    }
   }catch{/* Unverified legacy references never become media elements. */}
  }
  return {source,title:(s.hook??'Nyhetsfilm').slice(0,150),content:normalized.kind==='unavailable'?normalized:{kind:'media',text,media,...(!media.length?{notice:'Ingen verifierbar färdig video finns att visa för den här posten.'}:{})},channelStates,sourceHref:'/projects/ai-media-automation/scripts',revisionHash:createHash('sha256').update(JSON.stringify([s.hook,s.script,s.cta,s.video_url])).digest('hex')};
 }
 const content=await readSocialContent(db,actor,{projectId:source.projectId});
 const post=content.posts.find(p=>p.id===source.postId);
 let revision=post?.revision;
 if(source.jobId!==null){
  const schedule=await readSchedules(db,actor,{projectId:source.projectId});
  const batch=schedule.batches.find(b=>b.jobs.some(j=>j.id===source.jobId&&j.postId===source.postId));
  const item=batch?.manifest.items.find(i=>i.postId===source.postId&&i.revisionId===source.revisionId&&i.sha256===source.sha256);
  revision=item?batch?.review?.find(r=>r.item.postId===source.postId&&r.item.revisionId===source.revisionId)?.revision??undefined:undefined;
 }
 if(!revision||revision.id!==source.revisionId||revision.sha256!==source.sha256)throw new CalendarError('CONFLICT');
 if(revision.media.length>10)throw new CalendarError('UNAVAILABLE');
 const media=(await Promise.all(revision.media.map(m=>resolveOwnedPreviewMedia(db,actor,source.projectId,{assetId:m.id,sha256:m.sha256,name:revision!.draft.title,mimeType:m.mimeType})))).filter((m):m is ReviewMedia=>m!==null);
 const normalized=normalizeReviewContent({kind:null,outputKey:null,content:revision.draft.text});
 return {source,title:revision.draft.title,content:normalized.kind==='unavailable'?normalized:{kind:'media',text:revision.draft.text,media,...(media.length<revision.media.length?{notice:'En del av bild- eller videounderlaget kunde inte verifieras och visas inte.'}:{})},sourceHref:content.workspaceUrl??null,revisionHash:revision.sha256};
}
