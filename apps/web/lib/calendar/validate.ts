import {CALENDAR_TIME_ZONE,CalendarError,type CalendarRange,type CalendarMutation,type CalendarEventDraft,type CalendarTime} from './types';
import {calendarDate,stockholmDate} from './time';
import {validateCalendarRepeat} from './repeat';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function invalid():never {throw new CalendarError('INVALID_INPUT');}
export function calendarFields(input:unknown,keys:string[]):asserts input is Record<string,unknown> {
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))invalid();
}
export function calendarId(value:unknown):asserts value is string {
 if(typeof value!=='string'||!uuid.test(value))invalid();
}
function utc(value:unknown):string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))invalid();
 const d=new Date(value);
 if(!Number.isFinite(d.getTime())||d.toISOString()!==value||value.startsWith('0000'))invalid();
 return value;
}
export function parseCalendarTime(input:unknown):CalendarTime {
 calendarFields(input,['kind','startUtc','endUtc','timeZone','startDate','endDateExclusive']);
 if(input.timeZone!==CALENDAR_TIME_ZONE)invalid();
 if(input.kind==='timed'){
  calendarFields(input,['kind','startUtc','endUtc','timeZone']);
  const startUtc=utc(input.startUtc),endUtc=input.endUtc===null?null:utc(input.endUtc);
  if(endUtc!==null&&endUtc<=startUtc)invalid();
  return {kind:'timed',startUtc,endUtc,timeZone:CALENDAR_TIME_ZONE};
 }
 if(input.kind==='all_day'){
  calendarFields(input,['kind','startDate','endDateExclusive','timeZone']);
  const startDate=calendarDate(input.startDate),endDateExclusive=calendarDate(input.endDateExclusive);
  if(endDateExclusive<=startDate)invalid();
  return {kind:'all_day',startDate,endDateExclusive,timeZone:CALENDAR_TIME_ZONE};
 }
 return invalid();
}
export function parseCalendarRange(input:unknown):CalendarRange {
 calendarFields(input,['fromDate','toDateExclusive','timeZone']);
 if(input.timeZone!==CALENDAR_TIME_ZONE)invalid();
 const fromDate=calendarDate(input.fromDate),toDateExclusive=calendarDate(input.toDateExclusive);
 const length=(Date.parse(toDateExclusive)-Date.parse(fromDate))/86400000;
 if(length<=0||length>31)invalid();
 return {fromDate,toDateExclusive,timeZone:CALENDAR_TIME_ZONE};
}
export function parseCalendarDraft(input:unknown):CalendarEventDraft {
 calendarFields(input,['kind','title','description','location','projectId','taskId','time','workStatus','repeat']);
 if(input.kind!=='private'&&input.kind!=='work_block')invalid();
 if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>150||/[\u0000-\u001f\u007f]/.test(input.title))invalid();
 for(const [key,max] of [['description',5000],['location',500]] as const){
  const value=input[key];
  const controls=key==='description'?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/;
  if(typeof value!=='string'||value.length>max||controls.test(value))invalid();
 }
 if(input.projectId!==null)calendarId(input.projectId);
 if(input.taskId!==null)calendarId(input.taskId);
 if(input.taskId!==null&&input.projectId===null)invalid();
 if(input.kind==='private'?input.workStatus!==null:!['planned','in_progress','done'].includes(input.workStatus as string))invalid();
 return {kind:input.kind,title:input.title.trim(),description:input.description as string,location:input.location as string,projectId:input.projectId as string|null,taskId:input.taskId as string|null,time:parseCalendarTime(input.time),workStatus:input.workStatus as CalendarEventDraft['workStatus'],...(input.repeat===undefined?{}:{repeat:validateCalendarRepeat(input.repeat,(input.time as {kind:string;startDate?:string;startUtc?:string}).kind==='all_day'?(input.time as {startDate:string}).startDate:stockholmDate((input.time as {startUtc:string}).startUtc))})};
}
export function parseCalendarMutation(input:unknown):CalendarMutation {
 calendarFields(input,['operation','eventId','idempotencyKey','expectedVersion','draft']);
 calendarId(input.eventId);calendarId(input.idempotencyKey);
 if(input.operation==='create'){
  calendarFields(input,['operation','eventId','idempotencyKey','draft']);
  return {operation:'create',eventId:input.eventId,idempotencyKey:input.idempotencyKey,draft:parseCalendarDraft(input.draft)};
 }
 if(!['update','cancel','restore'].includes(input.operation as string)||!Number.isSafeInteger(input.expectedVersion)||(input.expectedVersion as number)<1)invalid();
 const base={eventId:input.eventId,idempotencyKey:input.idempotencyKey,expectedVersion:input.expectedVersion as number};
 if(input.operation==='update')return {...base,operation:'update',draft:parseCalendarDraft(input.draft)};
 calendarFields(input,['operation','eventId','idempotencyKey','expectedVersion']);
 return {...base,operation:input.operation as 'cancel'|'restore'};
}
