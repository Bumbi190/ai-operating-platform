import type {CalendarWeekModel,CalendarEntry} from './types';
import {addCalendarDays,resolveCalendarLocal} from './time';

/** Read-only suggestions. A separate human-approved mutation is required to book them. */
export function proposeCalendarWeek(model:CalendarWeekModel, options:{max?:number;durationMinutes?:number}={}) {
 const max=Math.max(0,Math.min(15,Math.floor(options.max??5)));
 const duration=Math.max(15,Math.min(180,Math.floor(options.durationMinutes??60)));
 if(!model.availability.manual||!model.availability.tasks||!model.availability.workflows||!model.availability.social||Object.values(model.truncated).some(Boolean))return {proposals:[],blocked:'INCOMPLETE_SOURCES' as const};
 const projects=new Set(model.projects.map(p=>p.id));
 const tasks=model.unscheduledTasks.filter(t=>projects.has(t.projectId)&&['pending','in_progress'].includes(t.status)&&!(t.source==='dream'&&t.createdAt&&Date.parse(t.createdAt)<Date.now()-30*86400000));
 const proposals:{taskId:string;projectId:string;title:string;startUtc:string;endUtc:string}[]=[];
 const busy=model.entries.flatMap((e:CalendarEntry)=> e.time.kind==='timed'?[{start:e.time.startUtc,end:e.time.endUtc??new Date(Date.parse(e.time.startUtc)+15*60000).toISOString()}]:[{start:resolveCalendarLocal(e.time.startDate+'T00:00'),end:resolveCalendarLocal(e.time.endDateExclusive+'T00:00')}]);
 for(let date=model.range.fromDate;date<model.range.toDateExclusive&&proposals.length<max;date=addCalendarDays(date,1)){
  const weekday=new Date(date+'T12:00:00Z').getUTCDay();if(weekday===0||weekday===6)continue;
  for(let minute=9*60;minute+duration<=17*60&&proposals.length<max;minute+=30){
   const local=(value:number)=>date+'T'+String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
   let start:string,end:string;try{start=resolveCalendarLocal(local(minute));end=resolveCalendarLocal(local(minute+duration));}catch{continue;}
   if(busy.some(b=>start<b.end&&end>b.start))continue;
   const next=tasks[proposals.length];if(!next)break;
   proposals.push({taskId:next.id,projectId:next.projectId,title:next.title,startUtc:start,endUtc:end});
   busy.push({start,end});
  }
 }
 return {proposals,blocked:null};
}

