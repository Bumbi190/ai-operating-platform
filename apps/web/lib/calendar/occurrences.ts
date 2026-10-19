import type {CalendarEvent,CalendarEntry,CalendarRange} from './types';
import {repeatDates,moveRepeatedTime} from './repeat';
import {stockholmDate,addCalendarDays} from './time';
import {CalendarError} from './types';

/** Generate bounded projections. Every occurrence retains the series source ID and original version. */
export function projectManualOccurrences(events:CalendarEvent[],range:CalendarRange):CalendarEntry[] {
 const entries:CalendarEntry[]=[];
 for(const event of events){
  const repeat=event.repeat??null;
  const initial=event.time.kind==='all_day'?event.time.startDate:stockholmDate(event.time.startUtc);
  const durationDays=event.time.kind==='all_day'?Math.ceil((Date.parse(event.time.endDateExclusive+'T00:00Z')-Date.parse(initial+'T00:00Z'))/86400000)-1:event.time.endUtc?Math.ceil((Date.parse(stockholmDate(event.time.endUtc)+'T00:00Z')-Date.parse(initial+'T00:00Z'))/86400000):0;
  const from=repeat?addCalendarDays(range.fromDate,-Math.min(31,Math.max(0,durationDays))):range.fromDate;
  const dates=repeat?repeatDates(initial,repeat,from,range.toDateExclusive):[initial];
  for(const date of dates){
   let time=event.time;
   if(repeat){
    try{time=moveRepeatedTime(event.time,date);}
    catch(error){
     // An impossible Swedish wall-clock occurrence must not break the rest of the calendar.
     if(error instanceof CalendarError&&error.code==='INVALID_INPUT')continue;
     throw error;
    }
   }
   entries.push({id:'manual:'+event.id+(repeat?':'+date:''),source:{kind:'manual',eventId:event.id,version:event.version},
    title:event.title,time,projectId:event.projectId,status:event.status,editable:true,href:null,pendingChange:null,manualEvent:event});
  }
 }
 return entries;
}
