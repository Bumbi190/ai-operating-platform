import {CALENDAR_TIME_ZONE,CalendarError,type CalendarRange} from './types';
const dateFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:CALENDAR_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const minuteFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:CALENDAR_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export function calendarDate(value:unknown):string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000'))throw new CalendarError('INVALID_INPUT');
 const d=new Date(value+'T00:00:00.000Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new CalendarError('INVALID_INPUT');
 return value;
}
export function addCalendarDays(value:string,days:number):string {
 const d=new Date(calendarDate(value)+'T00:00:00.000Z');d.setUTCDate(d.getUTCDate()+days);
 return calendarDate(d.toISOString().slice(0,10));
}
export function stockholmDate(instant:string):string {
 const d=new Date(instant);if(!Number.isFinite(d.getTime()))throw new CalendarError('INVALID_INPUT');
 return calendarDate(dateFormatter.format(d));
}
export function stockholmMinute(instant:string):string {
 const d=new Date(instant);if(!Number.isFinite(d.getTime()))throw new CalendarError('INVALID_INPUT');
 return minuteFormatter.format(d).replace(' ','T');
}
export function weekRange(date:string):CalendarRange {
 const day=new Date(calendarDate(date)+'T00:00:00.000Z').getUTCDay();
 const fromDate=addCalendarDays(date,-((day+6)%7));
 return {fromDate,toDateExclusive:addCalendarDays(fromDate,7),timeZone:CALENDAR_TIME_ZONE};
}
/** Reject a gap or repeated wall minute, matching social content time handling. */
export function resolveCalendarLocal(local:string):string {
 if(typeof local!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new CalendarError('INVALID_INPUT');
 calendarDate(local.slice(0,10));
 const naive=Date.parse(local+':00Z'),matches:string[]=[];
 if(!Number.isFinite(naive))throw new CalendarError('INVALID_INPUT');
 for(const offset of [60,120]){
  const d=new Date(naive-offset*60000);
  if(stockholmMinute(d.toISOString())===local)matches.push(d.toISOString());
 }
 if(matches.length!==1)throw new CalendarError('INVALID_INPUT');
 return matches[0];
}
