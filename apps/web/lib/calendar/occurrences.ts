import type {CalendarEvent,CalendarEntry,CalendarRange} from './types';
import {repeatDates,moveRepeatedTime} from './repeat';
import {stockholmDate} from './time';

/** Generate bounded projections. Every occurrence retains the series source ID and original version. */
export function projectManualOccurrences(events:CalendarEvent[],range:CalendarRange):CalendarEntry[] {
 const entries:CalendarEntry[]=[];
 for(const event of events){
  const repeat=event.repeat??null;
  const initial=event.time.kind==='all_day'?event.time.startDate:stockholmDate(event.time.startUtc);
  const dates=repeat?repeatDates(initial,repeat,range.fromDate,range.toDateExclusive):[initial];
  for(const date of dates){
   const time=repeat?moveRepeatedTime(event.time,date):event.time;
   entries.push({id:'manual:'+event.id+(repeat?':'+date:''),source:{kind:'manual',eventId:event.id,version:event.version},
    title:event.title,time,projectId:event.projectId,status:event.status,editable:true,href:null,pendingChange:null,manualEvent:event});
  }
 }
 return entries;
}
