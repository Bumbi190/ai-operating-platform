import type {CalendarEvent,CalendarRange} from './types';
import {projectManualOccurrences} from './occurrences';
import {calendarBusyInterval,validateNonOverlappingIntervals,type CalendarBusyInterval} from './week-intervals';

/** Read-only review aid, not a booking authorization or transactional guarantee. */
export function recurringWeekPreflight(events:CalendarEvent[],range:CalendarRange,slots:CalendarBusyInterval[]) {
 try {
  if(events.some(e=>e.status==='scheduled'&&e.repeat&&e.time.kind==='all_day'&&e.time.endDateExclusive>range.toDateExclusive))return 'INCOMPLETE';
  const occurrences=projectManualOccurrences(events,range).filter(e=>e.status==='scheduled');
  const busy=occurrences.map(e=>calendarBusyInterval(e.time));
  return validateNonOverlappingIntervals(slots,busy)?'CLEAR':'CONFLICT';
 } catch {return 'INCOMPLETE';}
}
