import {beforeAll,afterAll,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {initializeCalendarDb,USER_A,USER_B} from './test-db';
import {fixtureCreate,fixtureDraft} from './fixtures.test-utils';
import {listCalendarEvents,mutateCalendarEvent} from './store';
import {projectManualOccurrences} from './occurrences';
let fixture:ReturnType<typeof initializeCalendarDb>;
const week={fromDate:'2026-11-02',toDateExclusive:'2026-11-09',timeZone:'Europe/Stockholm'} as const;
beforeAll(()=>{
 fixture=initializeCalendarDb();
 fixture.sql(readFileSync(resolve(process.cwd(),'supabase/migrations/20261019081000_user_calendar_recurrence.sql'),'utf8'));
},60000);
afterAll(()=>fixture?.close());
it('persists an earlier recurring series, projects future weeks, updates and cancels the series under owner RLS',async()=>{
 const owner=fixture.forUser(USER_A),other=fixture.forUser(USER_B);
 const draft=fixtureDraft({time:{kind:'timed',startUtc:'2026-10-19T07:00:00.000Z',endUtc:'2026-10-19T08:00:00.000Z',timeZone:'Europe/Stockholm'},repeat:{frequency:'weekly',until:null}});
 const created=await mutateCalendarEvent(owner,fixtureCreate(draft));
 expect(created.event.repeat).toEqual({frequency:'weekly',until:null});
 const page=await listCalendarEvents(owner,week);
 expect(page.events.map(x=>x.id)).toContain(created.event.id);
 expect((await listCalendarEvents(other,week)).events).toEqual([]);
 expect(projectManualOccurrences(page.events,week).find(x=>x.source.kind==='manual'&&x.source.eventId===created.event.id)?.time).toMatchObject({startUtc:'2026-11-02T08:00:00.000Z'});
 const changed=await mutateCalendarEvent(owner,{operation:'update',eventId:created.event.id,expectedVersion:1,idempotencyKey:randomUUID(),draft:{...draft,title:'Gym flyttat'}});
 expect(changed.event.version).toBe(2);
 const cancelled=await mutateCalendarEvent(owner,{operation:'cancel',eventId:created.event.id,expectedVersion:2,idempotencyKey:randomUUID()});
 expect(cancelled.event.status).toBe('cancelled');
 expect((await listCalendarEvents(owner,week)).events.find(x=>x.id===created.event.id)?.status).toBe('cancelled');
});
it('rejects invalid recurrence dates in real SQL',async()=>{
 await expect(mutateCalendarEvent(fixture.forUser(USER_A),fixtureCreate({repeat:{frequency:'daily',until:'2026-10-01'}}))).rejects.toMatchObject({code:'INVALID_INPUT'});
});
