import 'server-only';
import {resolveCalendarAccess} from './access';
import {createAdminClient} from '@/lib/supabase/admin';
import {assertSameOrigin} from '@/lib/atlas/executive/http';
import {readSocialContent} from '@/lib/social-launch/content/store';
import {readSchedules} from '@/lib/social-launch/scheduling/store';
import type {CalendarSourceRef} from './types';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
export type ReportRow={project_id:string;post_id:string;revision_id:string;sha256:string;reported_by:string;reported_at:string};
type TableQuery={select:(columns:string)=>{in:(column:string,values:string[])=>Promise<{data:ReportRow[]|null;error:unknown}>};upsert:(row:Omit<ReportRow,'reported_at'>,opts:{onConflict:string})=>Promise<{error:unknown}>;delete:()=>{eq:(column:string,value:string)=>{eq:(column:string,value:string)=>Promise<{error:unknown}>}}};
export function reportTable(db:ReturnType<typeof createAdminClient>):TableQuery{return (db as unknown as {from:(name:string)=>TableQuery}).from('calendar_manual_publication_reports');}
export async function calendarManualPublicationApi(request:Request):Promise<Response>{
 const denied=assertSameOrigin(request);if(denied)return denied;
 const access=await resolveCalendarAccess();
 if(!access.ok)return access.response;
 if(access.actor.projectScopeAvailable===false)return Response.json({ok:false,code:'UNAVAILABLE'},{status:503,headers});
 try{
  if(Number(request.headers.get('content-length'))>2048)return Response.json({ok:false,code:'INVALID_INPUT'},{status:400,headers});
  const body=await request.json() as {operation?:unknown;source?:CalendarSourceRef};
  const source=body?.source;
  if((body.operation!=='mark'&&body.operation!=='unmark')||!source||source.kind!=='social'||source.jobId!==null
   ||!access.actor.allowedProjectIds.includes(source.projectId)
   ||![source.projectId,source.postId,source.revisionId].every(v=>/^[0-9a-f-]{36}$/i.test(v))
   ||!/^[a-f0-9]{64}$/.test(source.sha256))return Response.json({ok:false,code:'INVALID_INPUT'},{status:400,headers});
  const db=createAdminClient();
  const [content,schedules]=await Promise.all([readSocialContent(db,access.actor,{projectId:source.projectId}),readSchedules(db,access.actor,{projectId:source.projectId})]);
  const post=content.posts.find(p=>p.id===source.postId);
  if(!post||post.revision.id!==source.revisionId||post.revision.sha256!==source.sha256)
   return Response.json({ok:false,code:'CONFLICT'},{status:409,headers});
  const active=schedules.batches.some(batch=>batch.jobs.some(job=>job.postId===source.postId&&job.state!=='cancelled'));
  if(active)return Response.json({ok:false,code:'SCHEDULED_JOB'},{status:409,headers});
  const table=reportTable(db);
  const result=body.operation==='mark'
   ?await table.upsert({project_id:source.projectId,post_id:source.postId,revision_id:source.revisionId,sha256:source.sha256,reported_by:access.actor.userId},{onConflict:'project_id,post_id'})
   :await table.delete().eq('project_id',source.projectId).eq('post_id',source.postId);
  if(result.error)throw Error('write unavailable');
  return Response.json({ok:true,operation:body.operation},{headers});
 }catch{return Response.json({ok:false,code:'UNAVAILABLE'},{status:503,headers});}
}
