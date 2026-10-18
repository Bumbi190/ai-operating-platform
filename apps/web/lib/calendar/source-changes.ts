import 'server-only';
import type {AdminDb,CalendarActor,CalendarSourceRef,CalendarFailure} from './types';
import {CalendarError} from './types';
import {calendarFields,calendarId} from './validate';
import {resolveCalendarLocal} from './time';
import {readSocialContent,proposeSocialContent} from '../social-launch/content/store';
import type {SocialContentInput} from '../social-launch/content/types';
export async function requestCalendarSourceMove(db:AdminDb,actor:CalendarActor,input:{source:CalendarSourceRef;localMinute:string;idempotencyKey:string}):Promise<{ok:true;reviewRequired:true;reviewHref:string}|CalendarFailure>{
 try {
  calendarFields(input,['source','localMinute','idempotencyKey']);calendarId(input.idempotencyKey);
  const source=input.source;
  calendarFields(source,['kind','projectId','postId','revisionId','sha256','jobId']);
  if(source.kind!=='social')return {ok:false,code:'INVALID_INPUT'};
  calendarId(source.projectId);calendarId(source.postId);calendarId(source.revisionId);
  if(source.jobId!==null)calendarId(source.jobId);
  if(typeof source.sha256!=='string'||!/^[a-f0-9]{64}$/.test(source.sha256))return {ok:false,code:'INVALID_INPUT'};
  if(!actor.allowedProjectIds.includes(source.projectId))return {ok:false,code:'NOT_FOUND'};
  const scheduledAt=resolveCalendarLocal(input.localMinute);
  // Authoritative reader verifies real ownership before the scoped historical read.
  const view=await readSocialContent(db,actor,{projectId:source.projectId});
  const current=view.posts.find(p=>p.id===source.postId);
  if(!current)return {ok:false,code:'NOT_FOUND'};
  let revision:{id:string;sha256:string;planRevisionId:string;draft:SocialContentInput}|null=current.revision;
  if(revision.id!==source.revisionId){
   const {data,error}=await db.from('social_content_revisions').select('id,sha256,plan_revision_id,draft').eq('project_id',source.projectId).eq('post_id',source.postId).eq('id',source.revisionId).maybeSingle();
   if(error)throw new CalendarError('UNAVAILABLE');
   const old=data as {id:string;sha256:string;plan_revision_id:string;draft:SocialContentInput}|null;
   revision=old?{...old,planRevisionId:old.plan_revision_id}:null;
  }
  if(!revision||revision.sha256!==source.sha256)return {ok:false,code:'CONFLICT'};
  // Existing SQL checks exact revision, ownership and retry payload atomically.
  const changed=await proposeSocialContent(db,actor,{projectId:source.projectId,postId:source.postId,expectedRevisionId:source.revisionId,planRevisionId:revision.planRevisionId,idempotencyKey:'calendar_'+input.idempotencyKey,draft:{...revision.draft,scheduledAt}});
  return {ok:true,reviewRequired:true,reviewHref:changed.workspaceUrl};
 }catch(error){
  const code=(error as {code?:string}).code;
  return {ok:false,code:code==='NOT_FOUND'?'NOT_FOUND':code==='REVISION_CONFLICT'?'CONFLICT':code==='INVALID_BODY'||code==='INVALID_INPUT'?'INVALID_INPUT':'UNAVAILABLE'};
 }
}
