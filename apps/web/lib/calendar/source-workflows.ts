import 'server-only';
import type {AdminDb,CalendarActor,CalendarEntry,CalendarRange} from './types';
import {listInstancesForProjects} from '../workflows/store';
import {calendarPoint,calendarTimeInRange} from './source-social';
export async function readCalendarWorkflows(db:AdminDb,actor:CalendarActor,range:CalendarRange):Promise<{entries:CalendarEntry[];truncated:boolean}>{
 if(!actor.allowedProjectIds.length)return {entries:[],truncated:false};
 const rows=await listInstancesForProjects(db,actor.allowedProjectIds,{limit:501});
 const entries=rows.filter(r=>actor.allowedProjectIds.includes(r.project_id)&&r.wake_at!==null).map<CalendarEntry>(r=>({
  id:'workflow:'+r.id,source:{kind:'workflow',projectId:r.project_id,instanceId:r.id},title:'Fortsättning · '+r.instance_key,time:calendarPoint(r.wake_at!),projectId:r.project_id,status:r.status,editable:false,href:r.def_key==='familje-stunden.monthly-release'?'/releases':'/planning',pendingChange:null
 })).filter(e=>calendarTimeInRange(e.time,range));
 return {entries:entries.slice(0,500),truncated:rows.length>500};
}
