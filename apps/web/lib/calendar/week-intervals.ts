import type {CalendarTime} from './types';
import {resolveCalendarLocal} from './time';

/** Pure interval model for future atomic SQL approval. No DB writes or authorization. */
export type CalendarBusyInterval={startUtc:string;endUtc:string};
export function calendarBusyInterval(time:CalendarTime,pointBufferMinutes=15):CalendarBusyInterval {
 if(time.kind==='all_day')return {startUtc:resolveCalendarLocal(time.startDate+'T00:00'),endUtc:resolveCalendarLocal(time.endDateExclusive+'T00:00')};
 return {startUtc:time.startUtc,endUtc:time.endUtc??new Date(Date.parse(time.startUtc)+pointBufferMinutes*60000).toISOString()};
}
export function calendarIntervalsOverlap(a:CalendarBusyInterval,b:CalendarBusyInterval):boolean {
 return a.startUtc<b.endUtc&&b.startUtc<a.endUtc;
}
export function validateNonOverlappingIntervals(slots:CalendarBusyInterval[],busy:CalendarBusyInterval[]):boolean {
 if(slots.some(s=>!Number.isFinite(Date.parse(s.startUtc))||!Number.isFinite(Date.parse(s.endUtc))||s.startUtc>=s.endUtc))return false;
 for(let i=0;i<slots.length;i++){
  if(busy.some(b=>calendarIntervalsOverlap(slots[i],b)))return false;
  for(let j=0;j<i;j++)if(calendarIntervalsOverlap(slots[i],slots[j]))return false;
 }
 return true;
}
