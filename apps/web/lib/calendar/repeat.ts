import {addCalendarDays,calendarDate,resolveCalendarLocal,stockholmMinute} from './time';
import type {CalendarTime} from './types';
export type CalendarRepeat={frequency:'daily'|'weekly';until:string|null};
export function validateCalendarRepeat(input:unknown,startDate:string):CalendarRepeat|null {
 if(input===null)return null;
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_REPEAT');
 const repeat=input as Record<string,unknown>;
 if(Object.keys(repeat).some(k=>!['frequency','until'].includes(k))||!(repeat.frequency==='daily'||repeat.frequency==='weekly')||!(repeat.until===null||typeof repeat.until==='string'))throw Error('INVALID_REPEAT');
 const until=repeat.until===null?null:calendarDate(repeat.until as string);
 if(until!==null&&until<startDate)throw Error('INVALID_REPEAT');
 return {frequency:repeat.frequency as 'daily'|'weekly',until};
}
/** Calendar dates, not elapsed UTC hours, keep weekly and daily events at Swedish wall time across DST. */
export function repeatDates(startDate:string,repeat:CalendarRepeat|null,fromDate:string,toDateExclusive:string,limit=31):string[]{
 const start=calendarDate(startDate),from=calendarDate(fromDate),to=calendarDate(toDateExclusive);
 if(to<=from||limit<1)return [];
 if(!repeat)return start>=from&&start<to?[start]:[];
 const {frequency,until}=validateCalendarRepeat(repeat,start)!;
 const step=frequency==='weekly'?7:1,dates:string[]=[];
 const days=Math.max(0,Math.floor((Date.parse(from+'T00:00Z')-Date.parse(start+'T00:00Z'))/86400000));
 let date=addCalendarDays(start,Math.ceil(days/step)*step);
 for(;date<to&&(!until||date<=until)&&dates.length<limit;date=addCalendarDays(date,step))dates.push(date);
 return dates;
}
export function moveRepeatedTime(original:CalendarTime,date:string):CalendarTime {
 calendarDate(date);
 if(original.kind==='all_day'){
  const days=Math.round((Date.parse(original.endDateExclusive)-Date.parse(original.startDate))/86400000);
  return {...original,startDate:date,endDateExclusive:addCalendarDays(date,days)};
 }
 const local=stockholmMinute(original.startUtc),startUtc=resolveCalendarLocal(date+local.slice(10));
 if(!original.endUtc)return {...original,startUtc};
 const startMs=Date.parse(original.startUtc),endMs=Date.parse(original.endUtc),startLocalDate=local.slice(0,10);
 const endLocal=stockholmMinute(original.endUtc);
 const offsetDays=Math.round((Date.parse(endLocal.slice(0,10)+'T00:00Z')-Date.parse(startLocalDate+'T00:00Z'))/86400000);
 const targetEndDate=addCalendarDays(date,offsetDays);
 const endUtc=resolveCalendarLocal(targetEndDate+endLocal.slice(10));
 if(Date.parse(endUtc)<=Date.parse(startUtc)||endMs<=startMs)throw Error('INVALID_REPEAT');
 return {...original,startUtc,endUtc};
}
