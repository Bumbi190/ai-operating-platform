import {describe,it,expect} from 'vitest';
import {stockholmDate,weekRange,resolveCalendarLocal} from './time';
describe('Stockholm calendar time',()=>{
 it('starts the week on Monday across month and year boundaries',()=>{
  expect(weekRange('2026-10-18')).toEqual({fromDate:'2026-10-12',toDateExclusive:'2026-10-19',timeZone:'Europe/Stockholm'});
  expect(weekRange('2027-01-01').fromDate).toBe('2026-12-28');
 });
 it('uses the actual Stockholm day rather than the UTC day',()=>{
  expect(stockholmDate('2026-10-18T22:30:00.000Z')).toBe('2026-10-19');
 });
 it('resolves an explicit unambiguous winter minute',()=>{
  expect(resolveCalendarLocal('2026-12-01T20:30')).toBe('2026-12-01T19:30:00.000Z');
 });
 it.each(['2026-03-29T02:30','2026-10-25T02:30','2026-02-30T12:00','2026-10-01T24:00','tomorrow'])('rejects invalid or ambiguous local minute %s',local=>{
  expect(()=>resolveCalendarLocal(local)).toThrow();
 });
 it.each(['2026-02-30','2026-1-01','2026-13-01','2026-10-18junk'])('rejects invalid calendar date %s',date=>{
  expect(()=>weekRange(date)).toThrow();
 });
});
