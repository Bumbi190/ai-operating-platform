import {describe,it,expect} from 'vitest';
import {calendarBusyInterval,calendarIntervalsOverlap,validateNonOverlappingIntervals} from './week-intervals';
import {resolveCalendarLocal} from './time';
const timed=(a:string,b:string|null)=>({kind:'timed' as const,startUtc:a,endUtc:b,timeZone:'Europe/Stockholm' as const});
describe('atomic approval interval primitives',()=>{
 it('treats adjacent time intervals as nonoverlapping, not closed intervals',()=>{const a={startUtc:'2026-10-20T08:00:00.000Z',endUtc:'2026-10-20T09:00:00.000Z'},b={startUtc:a.endUtc,endUtc:'2026-10-20T10:00:00.000Z'};expect(calendarIntervalsOverlap(a,b)).toBe(false);expect(validateNonOverlappingIntervals([a,b],[])).toBe(true);});
 it('rejects overlaps inside batch and with existing private bookings',()=>{const a={startUtc:'2026-10-20T08:00:00.000Z',endUtc:'2026-10-20T09:00:00.000Z'},b={startUtc:'2026-10-20T08:30:00.000Z',endUtc:'2026-10-20T09:30:00.000Z'};expect(validateNonOverlappingIntervals([a,b],[])).toBe(false);expect(validateNonOverlappingIntervals([a],[b])).toBe(false);});
 it('expands overnight/all-day to Stockholm midnight and holds point events for 15 minutes',()=>{const a=calendarBusyInterval({kind:'all_day',startDate:'2026-10-24',endDateExclusive:'2026-10-26',timeZone:'Europe/Stockholm'});expect(a.startUtc).toBe(resolveCalendarLocal('2026-10-24T00:00'));expect(a.endUtc).toBe(resolveCalendarLocal('2026-10-26T00:00'));const p=calendarBusyInterval(timed('2026-10-20T08:00:00.000Z',null));expect(p.endUtc).toBe('2026-10-20T08:15:00.000Z');});
 it('rejects zero-length or invalid intervals',()=>{expect(validateNonOverlappingIntervals([{startUtc:'x',endUtc:'y'}],[])).toBe(false);expect(validateNonOverlappingIntervals([{startUtc:'2026-10-20T08:00:00.000Z',endUtc:'2026-10-20T08:00:00.000Z'}],[])).toBe(false);});
});
