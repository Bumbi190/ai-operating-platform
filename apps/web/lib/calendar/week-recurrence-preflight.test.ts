import {describe,it,expect} from 'vitest';
import {recurringWeekPreflight} from './week-recurrence-preflight';
import {weekRange,resolveCalendarLocal} from './time';
import type {CalendarEvent} from './types';
const m=(x:string)=>resolveCalendarLocal(x);
const event:CalendarEvent={id:'s',version:1,status:'scheduled',createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',kind:'private',title:'Meeting',description:'',location:'',projectId:null,taskId:null,workStatus:null,repeat:{frequency:'weekly',until:null},time:{kind:'timed',startUtc:m('2026-10-19T09:00'),endUtc:m('2026-10-19T10:00'),timeZone:'Europe/Stockholm'}};
describe('read-only recurring conflict review',()=>{
 it('finds following week recurring time',()=>expect(recurringWeekPreflight([event],weekRange('2026-10-26'),[{startUtc:m('2026-10-26T09:30'),endUtc:m('2026-10-26T10:30')}])).toBe('CONFLICT'));
 it('allows adjacent time',()=>expect(recurringWeekPreflight([event],weekRange('2026-10-26'),[{startUtc:m('2026-10-26T10:00'),endUtc:m('2026-10-26T11:00')}])).toBe('CLEAR'));
});
