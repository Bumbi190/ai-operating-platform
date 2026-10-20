import {describe,it,expect} from 'vitest';
import {externalSourcePreflight} from './external-source-preflight';
import {weekRange,resolveCalendarLocal} from './time';
import type {CalendarWeekModel} from './types';
const start=resolveCalendarLocal('2026-10-20T10:00'),end=resolveCalendarLocal('2026-10-20T11:00');
const model=():CalendarWeekModel=>({range:weekRange('2026-10-19'),entries:[],projects:[],unscheduledTasks:[],availability:{manual:true,social:true,workflows:true,tasks:true},truncated:{manual:false,social:false,workflows:false,tasks:false}});
describe('external feeds must fail closed in read-only preflight',()=>{
 it('rejects an unavailable social feed',()=>{const m=model();m.availability.social=false;expect(externalSourcePreflight(m,[{startUtc:start,endUtc:end}])).toBe('INCOMPLETE');});
 it('rejects a truncated workflow feed',()=>{const m=model();m.truncated.workflows=true;expect(externalSourcePreflight(m,[{startUtc:start,endUtc:end}])).toBe('INCOMPLETE');});
 it('recognizes a social publication time conflict',()=>{const m=model();m.entries=[{id:'social:p:post',source:{kind:'social',projectId:'p',postId:'post',revisionId:'rev',sha256:'hash',jobId:null},title:'Publish',projectId:'p',status:'queued',editable:false,href:null,pendingChange:null,time:{kind:'timed',startUtc:start,endUtc:null,timeZone:'Europe/Stockholm'}}];expect(externalSourcePreflight(m,[{startUtc:start,endUtc:end}])).toBe('CONFLICT');});
 it('passes only a complete nonoverlapping read',()=>expect(externalSourcePreflight(model(),[{startUtc:start,endUtc:end}])).toBe('CLEAR'));
});
