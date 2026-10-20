import 'server-only';
import type {AdminDb,CalendarActor,CalendarWeekModel} from './types';
export async function readCalendarTasks(db:AdminDb,actor:CalendarActor):Promise<{tasks:CalendarWeekModel['unscheduledTasks'];truncated:boolean}>{
 if(!actor.allowedProjectIds.length)return {tasks:[],truncated:false};
 const {data,error}=await db.from('manager_tasks').select('id,project_id,title,status').in('project_id',actor.allowedProjectIds).order('id',{ascending:true}).limit(501);
 if(error)throw Error('Calendar task source unavailable');
 const rows=(data??[]) as {id:string;project_id:string;title:string;status:string}[];
 return {tasks:rows.filter(t=>actor.allowedProjectIds.includes(t.project_id)).slice(0,500).map(t=>({id:t.id,projectId:t.project_id,title:t.title,status:t.status})),truncated:rows.length>500};
}
