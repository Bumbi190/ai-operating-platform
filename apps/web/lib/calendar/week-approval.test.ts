import {describe,it,expect} from 'vitest';
import {preflightWeekApproval} from './week-approval';
import {proposeCalendarWeek} from './week-proposal';
import {weekRange} from './time';
import type {CalendarWeekModel} from './types';
const fixture=():CalendarWeekModel=>({range:weekRange('2026-10-19'),entries:[],projects:[{id:'p',name:'P',color:'#fff'}],unscheduledTasks:[{id:'t',projectId:'p',title:'Review',status:'pending',source:'manual',createdAt:null}],availability:{manual:true,social:true,workflows:true,tasks:true},truncated:{manual:false,social:false,workflows:false,tasks:false}});
describe('approval preflight does not book',()=>{
 it('validates a current unmodified proposal',()=>{const m=fixture(),s=proposeCalendarWeek(m).proposals;expect(preflightWeekApproval(m,s)).toEqual({ok:true,count:1});});
 it('rejects stale task and a fabricated duplicate',()=>{const m=fixture(),s=proposeCalendarWeek(m).proposals;expect(preflightWeekApproval(m,[...s,...s])).toMatchObject({reason:'INVALID_PROPOSAL'});m.unscheduledTasks[0].status='done';expect(preflightWeekApproval(m,s)).toMatchObject({reason:'INVALID_PROPOSAL'});});
 it('fails closed when source data are missing',()=>{const m=fixture(),s=proposeCalendarWeek(m).proposals;m.availability.manual=false;expect(preflightWeekApproval(m,s)).toMatchObject({reason:'INCOMPLETE_SOURCES'});});
});
