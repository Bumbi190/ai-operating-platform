import {describe,it,expect} from 'vitest';
import {repeatDates,moveRepeatedTime,validateCalendarRepeat} from './repeat';
describe('calendar repeat pure calendar arithmetic',()=>{
 it('expands only visible daily and weekly dates',()=>{
  expect(repeatDates('2026-10-19',{frequency:'daily',until:'2026-10-22'},'2026-10-19','2026-10-26')).toEqual(['2026-10-19','2026-10-20','2026-10-21','2026-10-22']);
  expect(repeatDates('2026-10-05',{frequency:'weekly',until:null},'2026-10-19','2026-11-03')).toEqual(['2026-10-19','2026-10-26','2026-11-02']);
 });
 it('rejects invalid repeat dates',()=>{expect(()=>validateCalendarRepeat({frequency:'daily',until:'2026-10-01'},'2026-10-19')).toThrow();});
 it('keeps local 09:00 over winter-time transition',()=>{
  const time={kind:'timed' as const,startUtc:'2026-10-19T07:00:00.000Z',endUtc:'2026-10-19T08:00:00.000Z',timeZone:'Europe/Stockholm' as const};
  expect(moveRepeatedTime(time,'2026-10-26')).toEqual({...time,startUtc:'2026-10-26T08:00:00.000Z',endUtc:'2026-10-26T09:00:00.000Z'});
 });
 it('rejects nonexistent local times at DST transition rather than silently shifting them',()=>{
  const time={kind:'timed' as const,startUtc:'2026-03-22T01:30:00.000Z',endUtc:null,timeZone:'Europe/Stockholm' as const};
  expect(()=>moveRepeatedTime(time,'2026-03-29')).toThrow();
 });
});
