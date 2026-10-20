import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {initializeCalendarDb,USER_A} from './test-db';
import {mutateCalendarEvent} from './store';
import type {CalendarEventDraft} from './types';
let fixture:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{fixture=initializeCalendarDb();fixture.sql(readFileSync(resolve(process.cwd(),'lib/calendar/owner-lock-candidate.sql'),'utf8'));},60000);
afterAll(()=>fixture?.close(),60000);
const draft:CalendarEventDraft={kind:'private',title:'Testavtal',description:'',location:'',projectId:null,taskId:null,workStatus:null,time:{kind:'timed',startUtc:'2026-10-20T08:00:00.000Z',endUtc:'2026-10-20T09:00:00.000Z',timeZone:'Europe/Stockholm'}};
describe('owner-lock candidate installed only in isolated SQL fixture',()=>{
 it('preserves ordinary authenticated calendar creates and idempotency',async()=>{
  const input={operation:'create' as const,eventId:randomUUID(),idempotencyKey:randomUUID(),draft};
  const one=await mutateCalendarEvent(fixture.forUser(USER_A),input);
  const repeat=await mutateCalendarEvent(fixture.forUser(USER_A),input);
  expect(repeat.mutationId).toBe(one.mutationId);
  expect(fixture.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`)).toBe('1');
 });
 it('preserves same-key different-payload conflict',async()=>{
  const input={operation:'create' as const,eventId:randomUUID(),idempotencyKey:randomUUID(),draft};
  await mutateCalendarEvent(fixture.forUser(USER_A),input);
  await expect(mutateCalendarEvent(fixture.forUser(USER_A),{...input,draft:{...draft,title:'Different'}})).rejects.toMatchObject({code:'CONFLICT'});
 });
});
