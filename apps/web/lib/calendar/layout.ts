import type {CalendarEntry,CalendarRange,CalendarLayout} from './types';
import {addCalendarDays,resolveCalendarLocal,stockholmMinute} from './time';
import {parseCalendarRange} from './validate';
type Slot=CalendarLayout['days'][number]['timed'][number];
function minute(utc:string):number {
 const local=stockholmMinute(utc);return Number(local.slice(11,13))*60+Number(local.slice(14,16));
}
function assignColumns(slots:Slot[]):Slot[] {
 slots.sort((a,b)=>a.startMinute-b.startMinute||a.endMinute-b.endMinute||a.entryId.localeCompare(b.entryId));
 let group:Slot[]=[],ends:number[]=[],until=-1;
 const finish=()=>{for(const slot of group)slot.columnCount=ends.length;group=[];ends=[];};
 for(const slot of slots){
  if(slot.startMinute>=until){finish();until=-1;}
  let column=ends.findIndex(end=>end<=slot.startMinute);
  if(column<0)column=ends.length;
  ends[column]=slot.endMinute;slot.column=column;group.push(slot);until=Math.max(until,slot.endMinute);
 }
 finish();return slots;
}
export function layoutCalendarWeek(entries:CalendarEntry[],input:CalendarRange):CalendarLayout {
 const range=parseCalendarRange(input),days:CalendarLayout['days']=[];
 for(let date=range.fromDate;date<range.toDateExclusive;date=addCalendarDays(date,1)){
  const next=addCalendarDays(date,1);
  const start=resolveCalendarLocal(date+'T00:00'),end=resolveCalendarLocal(next+'T00:00');
  const allDay:CalendarEntry[]=[],timed:Slot[]=[];
  for(const entry of entries){
   const t=entry.time;
   if(t.kind==='all_day'){
    if(t.startDate<=date&&t.endDateExclusive>date)allDay.push(entry);
    continue;
   }
   if(t.startUtc>=end||(t.endUtc===null?t.startUtc<start:t.endUtc<=start))continue;
   const startMinute=t.startUtc<start?0:minute(t.startUtc);
   // A point's 15 display minutes never change its stored null end.
   const endMinute=t.endUtc===null?Math.min(1440,startMinute+15):t.endUtc>=end?1440:Math.max(startMinute+1,minute(t.endUtc));
   timed.push({entryId:entry.id,startMinute,endMinute,column:0,columnCount:1,isPoint:t.endUtc===null});
  }
  days.push({date,allDay,timed:assignColumns(timed)});
 }
 return {days};
}
