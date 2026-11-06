import {describe,it,expect} from 'vitest';
import {adjustWeekProposal} from './week-adjust';
import {proposeCalendarWeek} from './week-proposal';
import {weekRange} from './time';
import type {CalendarWeekModel} from './types';
const fixture=():CalendarWeekModel=>({range:weekRange('2026-10-19'),entries:[],projects:[{id:'p',name:'Project',color:'#fff'}],unscheduledTasks:[{id:'t',projectId:'p',title:'Task',status:'pending',source:'manual',createdAt:null}],availability:{manual:true,social:true,workflows:true,tasks:true},truncated:{manual:false,social:false,workflows:false,tasks:false}});
describe('weekly suggestion editing never persists',()=>{
 it('moves a proposed slot without mutating its source',()=>{const model=fixture(),slots=proposeCalendarWeek(model).proposals;const copy=JSON.stringify(slots);const changed=adjustWeekProposal(model,slots,'t','2026-10-20T11:00');expect(changed.ok).toBe(true);if(changed.ok)expect(changed.proposals[0].startUtc).not.toBe(slots[0].startUtc);expect(JSON.stringify(slots)).toBe(copy);});
 it('rejects weekends, out-of-week slots and unknown tasks',()=>{const m=fixture(),slots=proposeCalendarWeek(m).proposals;expect(adjustWeekProposal(m,slots,'t','2026-10-24T11:00')).toMatchObject({reason:'INVALID_SLOT'});expect(adjustWeekProposal(m,slots,'x','2026-10-20T11:00')).toMatchObject({reason:'UNKNOWN_TASK'});});
 it('refuses incomplete data rather than creating an apparent approval',()=>{const m=fixture(),slots=proposeCalendarWeek(m).proposals;m.availability.manual=false;expect(adjustWeekProposal(m,slots,'t','2026-10-20T11:00')).toMatchObject({reason:'INCOMPLETE_SOURCES'});});
});
