import 'server-only';
import type {CalendarReadDeps,CalendarActor,CalendarRange,CalendarWeekModel,CalendarEntry} from './types';
import {listCalendarEvents} from './store';
import {readCalendarSocial} from './source-social';
import {readCalendarTasks} from './source-tasks';
import {readCalendarWorkflows} from './source-workflows';
import {parseCalendarRange} from './validate';
import {projectCalendarWorkflowLinks} from './workflow-link';
import {projectManualOccurrences} from './occurrences';
import {readCalendarMediaEvents,emptyMediaEvents} from './source-media-events';
import {reportTable} from './manual-publication-api';
export async function readCalendarWeek(deps:CalendarReadDeps,actor:CalendarActor,input:CalendarRange):Promise<CalendarWeekModel>{
 const range=parseCalendarRange(input);
 const projectRead=<T>(load:()=>Promise<T>):Promise<T>=>actor.projectScopeAvailable===false?Promise.reject(Error('Calendar project scope unavailable')):load();
 const [manual,social,workflows,tasks,projects,mediaQueue,reports]=await Promise.allSettled([
  listCalendarEvents(deps.sessionDb,range),projectRead(()=>readCalendarSocial(deps.adminDb,actor,range)),
  projectRead(()=>readCalendarWorkflows(deps.adminDb,actor,range)),projectRead(()=>readCalendarTasks(deps.adminDb,actor)),
  projectRead(async()=>{
   if(!actor.allowedProjectIds.length)return [];
   const {data,error}=await deps.adminDb.from('projects').select('id,name,color').in('id',actor.allowedProjectIds).eq('owner_id',actor.userId).order('id',{ascending:true});
   if(error)throw Error('Calendar project labels unavailable');
   return (data??[]) as {id:string;name:string;color:string|null}[];
  }),readCalendarMediaEvents(deps.adminDb,actor,range),projectRead(async()=>actor.allowedProjectIds.length?reportTable(deps.adminDb).select('project_id,post_id,revision_id,sha256,reported_by,reported_at').in('project_id',actor.allowedProjectIds.slice(0,500)): {data:[],error:null})
 ]);
 const manualEntries:CalendarEntry[]=manual.status==='fulfilled'?projectManualOccurrences(manual.value.events,range):[];
 const linked=projectCalendarWorkflowLinks(manualEntries,workflows.status==='fulfilled'?workflows.value.instances:[],actor.projectScopeAvailable===false?[]:actor.allowedProjectIds);
 const media=mediaQueue.status==='fulfilled'?mediaQueue.value:emptyMediaEvents(false);
 const reportRows=reports.status==='fulfilled'&&!reports.value.error?reports.value.data??[]:[];
 const reportMap=new Map(reportRows.map(r=>[r.project_id+':'+r.post_id,r]));
 const socialEntries=social.status==='fulfilled'?social.value.entries.map(e=>{if(e.source.kind!=='social'||e.source.jobId!==null)return e;const report=reportMap.get(e.source.projectId+':'+e.source.postId);return report&&report.revision_id===e.source.revisionId&&report.sha256===e.source.sha256?{...e,status:'manually_published',manualPublished:{reportedBy:report.reported_by,reportedAt:report.reported_at}}:e;}):[];
 return {range,mediaEvents:{available:media.available,truncated:media.truncated,undated:media.undated},workflowOptions:workflows.status==='fulfilled'?workflows.value.options:[],entries:[...linked,...socialEntries,...(workflows.status==='fulfilled'?workflows.value.entries:[]),...media.entries],
  unscheduledTasks:tasks.status==='fulfilled'?tasks.value.tasks:[],
  projects:projects.status==='fulfilled'?projects.value.map(p=>({id:p.id,name:p.name,color:p.color??'#5a72db'})):[],
  availability:{manual:manual.status==='fulfilled',social:social.status==='fulfilled'&&social.value.available&&reports.status==='fulfilled'&&!reports.value.error,workflows:workflows.status==='fulfilled',tasks:tasks.status==='fulfilled'},
  truncated:{manual:manual.status==='fulfilled'&&manual.value.truncated,social:social.status==='fulfilled'&&social.value.truncated,workflows:workflows.status==='fulfilled'&&workflows.value.truncated,tasks:tasks.status==='fulfilled'&&tasks.value.truncated}
 };
}
