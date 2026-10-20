import {calendarId} from './validate';
import {weekRange} from './time';
export type CalendarChangedEffect={event:'calendar_changed';conversationId:string;mutationId:string;eventId:string;version:number;calendarHref:string};
export function decodeCalendarEffect(value:unknown,conversationId:string):CalendarChangedEffect|null{
 try{
  if(!value||typeof value!=='object')return null;
  const v=value as Record<string,unknown>;
  if(v.event!=='calendar_changed'||v.conversationId!==conversationId)return null;
  for(const key of ['conversationId','mutationId','eventId'])calendarId(v[key]);
  if(!Number.isSafeInteger(v.version)||(v.version as number)<1||typeof v.calendarHref!=='string')return null;
  const match=/^\/calendar\?week=(\d{4}-\d{2}-\d{2})$/.exec(v.calendarHref);
  if(!match||weekRange(match[1]).fromDate!==match[1])return null;
  return {event:'calendar_changed',conversationId,mutationId:v.mutationId as string,eventId:v.eventId as string,version:v.version as number,calendarHref:v.calendarHref};
 }catch{return null;}
}
export function calendarChangedForResult(tool:string,result:unknown,conversationId:string):CalendarChangedEffect|null{
 if(!['create_calendar_event','update_calendar_event','cancel_calendar_event'].includes(tool)||!result||typeof result!=='object')return null;
 const r=result as Record<string,unknown>;if(r.ok!==true)return null;
 const event=r.event as {id?:unknown;version?:unknown}|undefined;
 const change=r.change as Record<string,unknown>|undefined;
 return decodeCalendarEffect({event:'calendar_changed',conversationId,mutationId:change?.mutationId??r.mutationId,eventId:change?.eventId??event?.id,version:change?.version??event?.version,calendarHref:change?.calendarHref??r.calendarHref},conversationId);
}
