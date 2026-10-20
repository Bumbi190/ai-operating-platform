import type {CalendarWeekModel} from './types';
import {calendarBusyInterval,validateNonOverlappingIntervals} from './week-intervals';

/** Read-only and intentionally conservative: external feeds are not transactional. */
export function externalSourcePreflight(model:CalendarWeekModel,slots:{startUtc:string;endUtc:string}[]):'CLEAR'|'CONFLICT'|'INCOMPLETE' {
 if(!model.availability.social||!model.availability.workflows||model.truncated.social||model.truncated.workflows||model.truncated.manual)return 'INCOMPLETE';
 if(slots.length===0)return 'INCOMPLETE';
 try {
  const busy=model.entries.filter(e=>e.source.kind==='social'||e.source.kind==='workflow').map(e=>calendarBusyInterval(e.time));
  return validateNonOverlappingIntervals(slots,busy)?'CLEAR':'CONFLICT';
 }catch{return 'INCOMPLETE';}
}
