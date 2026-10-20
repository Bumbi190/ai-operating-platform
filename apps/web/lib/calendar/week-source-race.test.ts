import {describe,it,expect} from 'vitest';
import {calendarSourceSnapshotMatches} from './week-source-snapshot';
import {weekRange,resolveCalendarLocal} from './time';
import type {CalendarWeekModel} from './types';
const base=():CalendarWeekModel=>({range:weekRange('2026-10-19'),entries:[{id:'scheduled',source:{kind:'social',projectId:'p',postId:'post',revisionId:'v1',sha256:'digest',jobId:'job'},projectId:'p',title:'Post',status:'queued',editable:false,href:null,pendingChange:null,time:{kind:'timed',startUtc:resolveCalendarLocal('2026-10-20T10:00'),endUtc:null,timeZone:'Europe/Stockholm'}}],projects:[{id:'p',name:'Project',color:'#abc'}],unscheduledTasks:[],availability:{manual:true,social:true,workflows:true,tasks:true},truncated:{manual:false,social:false,workflows:false,tasks:false}});
describe('source changes between preview and approval',()=>{
 it('rejects changed revision even when its scheduled time is unchanged',()=>{const before=base(),after=base();if(after.entries[0].source.kind==='social')after.entries[0].source.revisionId='v2';expect(calendarSourceSnapshotMatches(before,after)).toBe(false);});
 it('rejects a newly appearing workflow wake-up',()=>{const before=base(),after=base();after.entries.push({id:'wf',source:{kind:'workflow',projectId:'p',instanceId:'i'},title:'Resume',projectId:'p',status:'active',editable:false,href:null,pendingChange:null,time:{kind:'timed',startUtc:resolveCalendarLocal('2026-10-20T11:00'),endUtc:null,timeZone:'Europe/Stockholm'}});expect(calendarSourceSnapshotMatches(before,after)).toBe(false);});
});
