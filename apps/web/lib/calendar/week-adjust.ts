import type {CalendarWeekModel} from './types';
import {resolveCalendarLocal} from './time';
import {proposeCalendarWeek} from './week-proposal';

type Slot={taskId:string;projectId:string;title:string;startUtc:string;endUtc:string};
/** Local editing only: this function has no database writes or authorization effect. */
export function adjustWeekProposal(model:CalendarWeekModel, proposals:Slot[], taskId:string, startLocal:string, durationMinutes=60):{ok:true;proposals:Slot[]}|{ok:false;reason:'INVALID_SLOT'|'CONFLICT'|'INCOMPLETE_SOURCES'|'UNKNOWN_TASK'} {
 if(proposeCalendarWeek(model,{max:0}).blocked)return {ok:false,reason:'INCOMPLETE_SOURCES'};
 const index=proposals.findIndex(p=>p.taskId===taskId);
 if(index<0||proposals.some((p,i)=>i!==index&&p.taskId===taskId))return {ok:false,reason:'UNKNOWN_TASK'};
 const entry=proposals[index];
 if(!model.projects.some(p=>p.id===entry.projectId)||!model.unscheduledTasks.some(t=>t.id===taskId&&t.projectId===entry.projectId))return {ok:false,reason:'UNKNOWN_TASK'};
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startLocal)||!Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>180)return {ok:false,reason:'INVALID_SLOT'};
 const weekday=new Date(startLocal.slice(0,10)+'T12:00:00Z').getUTCDay();
 const mins=Number(startLocal.slice(11,13))*60+Number(startLocal.slice(14,16));
 if(weekday===0||weekday===6||mins<540||mins+durationMinutes>1020||startLocal.slice(0,10)<model.range.fromDate||startLocal.slice(0,10)>=model.range.toDateExclusive)return {ok:false,reason:'INVALID_SLOT'};
 let startUtc:string,endUtc:string;
 try{startUtc=resolveCalendarLocal(startLocal);const end=new Date(Date.parse(startLocal+':00Z')+durationMinutes*60000).toISOString().slice(0,16);endUtc=resolveCalendarLocal(end);}catch{return {ok:false,reason:'INVALID_SLOT'};}
 const busy=[...proposals.filter((_,i)=>i!==index).map(p=>({start:p.startUtc,end:p.endUtc})),...model.entries.map(e=>e.time.kind==='timed'?{start:e.time.startUtc,end:e.time.endUtc??new Date(Date.parse(e.time.startUtc)+900000).toISOString()}:{start:resolveCalendarLocal(e.time.startDate+'T00:00'),end:resolveCalendarLocal(e.time.endDateExclusive+'T00:00')})];
 if(busy.some(b=>startUtc<b.end&&endUtc>b.start))return {ok:false,reason:'CONFLICT'};
 return {ok:true,proposals:proposals.map((p,i)=>i===index?{...p,startUtc,endUtc}:p)};
}
