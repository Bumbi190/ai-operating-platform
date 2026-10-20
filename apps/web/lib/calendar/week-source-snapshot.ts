import 'server-only';
import {createHash} from 'node:crypto';
import type {CalendarWeekModel} from './types';

/** Server-side comparison only. A matching digest is NOT a transaction lock or authorization. */
export function calendarSourceSnapshot(model:CalendarWeekModel):{ok:true;digest:string}|{ok:false;reason:'INCOMPLETE_SOURCES'} {
 if(Object.values(model.availability).some(v=>!v)||Object.values(model.truncated).some(Boolean))return {ok:false,reason:'INCOMPLETE_SOURCES'};
 const entries=model.entries.map(e=>({id:e.id,source:e.source,projectId:e.projectId,status:e.status,time:e.time,pendingChange:e.pendingChange})).sort((a,b)=>a.id.localeCompare(b.id));
 const tasks=model.unscheduledTasks.map(t=>({id:t.id,projectId:t.projectId,title:t.title,status:t.status,source:t.source,createdAt:t.createdAt})).sort((a,b)=>a.id.localeCompare(b.id));
 const projects=model.projects.map(p=>({id:p.id,name:p.name})).sort((a,b)=>a.id.localeCompare(b.id));
 const canonical=JSON.stringify({range:model.range,entries,tasks,projects});
 return {ok:true,digest:createHash('sha256').update(canonical).digest('hex')};
}
export function calendarSourceSnapshotMatches(before:CalendarWeekModel,after:CalendarWeekModel):boolean {
 const a=calendarSourceSnapshot(before),b=calendarSourceSnapshot(after);
 return a.ok&&b.ok&&a.digest===b.digest;
}
