import {describe,it,expect} from 'vitest';
import {proposeCalendarWeek} from './week-proposal';
import {weekRange,resolveCalendarLocal} from './time';
import type {CalendarWeekModel} from './types';
const base=():CalendarWeekModel=>({range:weekRange('2026-10-19'),entries:[],projects:[{id:'project',name:'P',color:'#fff'}],unscheduledTasks:[{id:'task',projectId:'project',title:'Check website',status:'pending',source:'manual',createdAt:null}],availability:{manual:true,social:true,workflows:true,tasks:true},truncated:{manual:false,social:false,workflows:false,tasks:false}});
describe('read-only calendar week suggestions',()=>{
 it('proposes weekday slots without storing anything',()=>{const m=base();const original=JSON.stringify(m);const r=proposeCalendarWeek(m);expect(r.proposals).toHaveLength(1);expect(r.proposals[0].startUtc).toBe(resolveCalendarLocal('2026-10-19T09:00'));expect(JSON.stringify(m)).toBe(original);});
 it('respects occupied time and project scope',()=>{const m=base();m.entries=[{id:'private',source:{kind:'manual',eventId:'e',version:1},title:'Private',projectId:null,status:'scheduled',editable:false,href:null,pendingChange:null,time:{kind:'timed',startUtc:resolveCalendarLocal('2026-10-19T09:00'),endUtc:resolveCalendarLocal('2026-10-19T10:00'),timeZone:'Europe/Stockholm'}}];expect(proposeCalendarWeek(m).proposals[0].startUtc).toBe(resolveCalendarLocal('2026-10-19T10:00'));m.unscheduledTasks[0].projectId='foreign';expect(proposeCalendarWeek(m).proposals).toHaveLength(0);});
 it('blocks incomplete views and stale dream suggestions',()=>{const m=base();m.availability.social=false;expect(proposeCalendarWeek(m).blocked).toBe('INCOMPLETE_SOURCES');m.availability.social=true;m.unscheduledTasks[0].source='dream';m.unscheduledTasks[0].createdAt='2026-06-11T00:00:00Z';expect(proposeCalendarWeek(m).proposals).toHaveLength(0);});
});
