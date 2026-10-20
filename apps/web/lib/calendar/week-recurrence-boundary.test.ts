import {describe,it,expect} from 'vitest';
import {recurringWeekPreflight} from './week-recurrence-preflight';
import {weekRange,resolveCalendarLocal} from './time';
import type {CalendarEvent} from './types';
const local=resolveCalendarLocal;
const event=(start:string,end:string):CalendarEvent=>({id:'repeat',version:1,status:'scheduled',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',kind:'private',title:'Meeting',description:'',location:'',projectId:null,taskId:null,workStatus:null,repeat:{frequency:'weekly',until:null},time:{kind:'timed',startUtc:local(start),endUtc:local(end),timeZone:'Europe/Stockholm'}});
const slot=(a:string,b:string)=>[{startUtc:local(a),endUtc:local(b)}];
describe('recurrence preflight boundary regression',()=>{
 it('recognizes the weekly meeting after spring DST transition',()=>expect(recurringWeekPreflight([event('2026-03-23T09:00','2026-03-23T10:00')],weekRange('2026-03-30'),slot('2026-03-30T09:30','2026-03-30T10:30'))).toBe('CONFLICT'));
 it('recognizes the weekly meeting after autumn DST transition',()=>expect(recurringWeekPreflight([event('2026-10-19T09:00','2026-10-19T10:00')],weekRange('2026-10-26'),slot('2026-10-26T09:30','2026-10-26T10:30'))).toBe('CONFLICT'));
 it('recognizes an overnight occurrence from Sunday into Monday',()=>expect(recurringWeekPreflight([event('2026-10-18T23:00','2026-10-19T01:00')],weekRange('2026-10-19'),slot('2026-10-19T00:15','2026-10-19T00:45'))).toBe('CONFLICT'));
});
