import 'server-only';
import type {CalendarReadDeps,CalendarActor,CalendarRange,CalendarWeekModel,CalendarEntry} from './types';
import {listCalendarEvents} from './store';
import {readCalendarSocial} from './source-social';
import {readCalendarTasks} from './source-tasks';
import {readCalendarWorkflows} from './source-workflows';
import {parseCalendarRange} from './validate';
import {projectCalendarWorkflowLinks} from './workflow-link';
import {projectManualOccurrences} from './occurrences';
export async function readCalendarWeek(deps:CalendarReadDeps,actor:CalendarActor,input:CalendarRange):Promise<CalendarWeekModel>{
 const range=parseCalendarRange(input);
 const projectRead=<T>(load:()=>Promise<T>):Promise<T>=>actor.projectScopeAvailable===false?Promise.reject(Error('Calendar project scope unavailable')):load();
 const [manual,social,workflows,tasks,projects]=await Promise.allSettled([
  listCalendarEvents(deps.sessionDb,range),projectRead(()=>readCalendarSocial(deps.adminDb,actor,range)),
  projectRead(()=>readCalendarWorkflows(deps.adminDb,actor,range)),projectRead(()=>readCalendarTasks(deps.adminDb,actor)),
  projectRead(async()=>{
   if(!actor.allowedProjectIds.length)return [];
   const {data,error}=await deps.adminDb.from('projects').select('id,name,color').in('id',actor.allowedProjectIds).eq('owner_id',actor.userId).order('id',{ascending:true});
   if(error)throw Error('Calendar project labels unavailable');
   return (data??[]) as {id:string;name:string;color:string|null}[];
  })
 ]);
 const manualEntries:CalendarEntry[]=manual.status==='fulfilled'?projectManualOccurrences(manual.value.events,range):[];
 const linked=projectCalendarWorkflowLinks(manualEntries,workflows.status==='fulfilled'?workflows.value.instances:[],actor.projectScopeAvailable===false?[]:actor.allowedProjectIds);
 return {range,workflowOptions:workflows.status==='fulfilled'?workflows.value.options:[],entries:[...linked,...(social.status==='fulfilled'?social.value.entries:[]),...(workflows.status==='fulfilled'?workflows.value.entries:[])],
  unscheduledTasks:tasks.status==='fulfilled'?tasks.value.tasks:[],
  projects:projects.status==='fulfilled'?projects.value.map(p=>({id:p.id,name:p.name,color:p.color??'#5a72db'})):[],
  availability:{manual:manual.status==='fulfilled',social:social.status==='fulfilled'&&social.value.available,workflows:workflows.status==='fulfilled',tasks:tasks.status==='fulfilled'},
  truncated:{manual:manual.status==='fulfilled'&&manual.value.truncated,social:social.status==='fulfilled'&&social.value.truncated,workflows:workflows.status==='fulfilled'&&workflows.value.truncated,tasks:tasks.status==='fulfilled'&&tasks.value.truncated}
 };
}
