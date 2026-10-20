import {describe,it,expect} from 'vitest';
import {calendarSourceSnapshot,calendarSourceSnapshotMatches} from './week-source-snapshot';
import {weekRange,resolveCalendarLocal} from './time';
import type {CalendarWeekModel} from './types';
const model=():CalendarWeekModel=>({range:weekRange('2026-10-19'),projects:[{id:'p',name:'Project',color:'#abc'}],unscheduledTasks:[{id:'t',projectId:'p',title:'Work',status:'pending',source:'manual',createdAt:null}],entries:[{id:'w',source:{kind:'workflow',projectId:'p',instanceId:'i'},title:'Wake',projectId:'p',status:'active',editable:false,href:null,pendingChange:null,time:{kind:'timed',startUtc:resolveCalendarLocal('2026-10-20T10:00'),endUtc:null,timeZone:'Europe/Stockholm'}}],availability:{manual:true,social:true,workflows:true,tasks:true},truncated:{manual:false,social:false,workflows:false,tasks:false}});
describe('server-side source snapshot comparison',()=>{
 it('matches an unchanged full source read',()=>{const before=model();expect(calendarSourceSnapshotMatches(before,structuredClone(before))).toBe(true);});
 it('rejects changed task state and a changed workflow time',()=>{const before=model(),after=model();after.unscheduledTasks[0].status='done';expect(calendarSourceSnapshotMatches(before,after)).toBe(false);const again=model();again.entries[0].time={kind:'timed',startUtc:resolveCalendarLocal('2026-10-20T11:00'),endUtc:null,timeZone:'Europe/Stockholm'};expect(calendarSourceSnapshotMatches(before,again)).toBe(false);});
 it('fails closed on missing or truncated external feeds',()=>{const before=model(),after=model();after.availability.social=false;expect(calendarSourceSnapshotMatches(before,after)).toBe(false);after.availability.social=true;after.truncated.workflows=true;expect(calendarSourceSnapshot(after)).toEqual({ok:false,reason:'INCOMPLETE_SOURCES'});});
});
