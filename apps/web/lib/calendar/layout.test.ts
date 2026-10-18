import {describe,it,expect} from 'vitest';
import {layoutCalendarWeek} from './layout';
import {weekRange} from './time';
import type {CalendarEntry,CalendarTime} from './types';
const zone='Europe/Stockholm' as const;
const timed=(startUtc:string,endUtc:string|null):CalendarTime=>({kind:'timed',startUtc,endUtc,timeZone:zone});
const entry=(id:string,time:CalendarTime):CalendarEntry=>({id,source:{kind:'manual',eventId:id,version:1},title:id,time,projectId:null,status:'scheduled',editable:true,href:null,pendingChange:null});
describe('calendar geometry',()=>{
 it('puts an all-day event on the local date through the autumn clock change',()=>{
  const e=entry('day',{kind:'all_day',startDate:'2026-10-25',endDateExclusive:'2026-10-26',timeZone:zone});
  const days=layoutCalendarWeek([e],weekRange('2026-10-25')).days;
  expect(days.filter(d=>d.allDay.length).map(d=>d.date)).toEqual(['2026-10-25']);
 });
 it('places two overlapping events side by side and leaves touching events alone',()=>{
  const a=entry('a',timed('2026-10-22T12:00:00.000Z','2026-10-22T13:00:00.000Z'));
  const b=entry('b',timed('2026-10-22T12:30:00.000Z','2026-10-22T13:30:00.000Z'));
  const c=entry('c',timed('2026-10-22T13:30:00.000Z','2026-10-22T14:00:00.000Z'));
  const slots=layoutCalendarWeek([a,b,c],weekRange('2026-10-22')).days.find(d=>d.date==='2026-10-22')!.timed;
  expect(slots.map(s=>[s.entryId,s.column,s.columnCount])).toEqual([['a',0,2],['b',1,2],['c',0,1]]);
  expect(slots[0].startMinute).toBe(14*60);
 });
 it('segments an overnight event and preserves the original ID and actual time',()=>{
  const e=entry('overnight',timed('2026-10-22T21:00:00.000Z','2026-10-23T01:00:00.000Z'));
  const before=JSON.stringify(e);
  const days=layoutCalendarWeek([e],weekRange('2026-10-22')).days.filter(d=>d.timed.length);
  expect(days.map(d=>[d.date,d.timed[0].entryId,d.timed[0].startMinute,d.timed[0].endMinute])).toEqual([
   ['2026-10-22','overnight',1380,1440],['2026-10-23','overnight',0,180]
  ]);expect(JSON.stringify(e)).toBe(before);
 });
 it('uses only visual height for a point without fabricating a real end',()=>{
  const e=entry('point',timed('2026-10-22T12:00:00.000Z',null));
  const slot=layoutCalendarWeek([e],weekRange('2026-10-22')).days.find(d=>d.date==='2026-10-22')!.timed[0];
  expect(slot.isPoint).toBe(true);expect(slot.startMinute).toBe(840);expect(slot.endMinute).toBeGreaterThan(slot.startMinute);
  expect(e.time.kind==='timed'&&e.time.endUtc).toBeNull();
 });
 it('does not extend an event into an exclusive midnight end date',()=>{
  const e=entry('midnight',timed('2026-10-22T21:00:00.000Z','2026-10-22T22:00:00.000Z'));
  expect(layoutCalendarWeek([e],weekRange('2026-10-22')).days.filter(d=>d.timed.length).map(d=>d.date)).toEqual(['2026-10-22']);
 });
});
