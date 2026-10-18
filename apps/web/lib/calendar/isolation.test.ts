import {beforeAll,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {initializeCalendarDb,USER_A,USER_B} from './test-db';
import {fixtureCreate,fixtureDraft,fixtureRange} from './fixtures.test-utils';
import {listCalendarEvents,mutateCalendarEvent} from './store';
let fixture:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{fixture=initializeCalendarDb()},30000);afterAll(()=>fixture?.close());
it('isolates events, mutation receipts and direct SQL reads between two users',async()=>{
 const a=fixture.forUser(USER_A),b=fixture.forUser(USER_B);
 const created=await mutateCalendarEvent(a,fixtureCreate());
 expect((await listCalendarEvents(b,fixtureRange)).events).toEqual([]);
 expect(fixture.sql('select count(*) from user_calendar_events',USER_B)).toBe('0');
 expect(fixture.sql('select count(*) from user_calendar_mutations',USER_B)).toBe('0');
 await expect(mutateCalendarEvent(b,{operation:'update',eventId:created.event.id,expectedVersion:1,idempotencyKey:randomUUID(),draft:fixtureDraft({title:'Attack'})})).rejects.toMatchObject({code:'NOT_FOUND'});
 expect((await listCalendarEvents(a,fixtureRange)).events[0]).toEqual(created.event);
});
it('has authenticated owner policies, no anon grants and invoker-only RPCs',async()=>{
 await mutateCalendarEvent(fixture.forUser(USER_A),fixtureCreate());
 const state=JSON.parse(fixture.sql(`select jsonb_build_object(
  'anon',has_table_privilege('anon','user_calendar_events','SELECT') or has_table_privilege('anon','user_calendar_mutations','SELECT'),
  'invoker',(select bool_and(not prosecdef) from pg_proc where proname in ('calendar_event_list','calendar_event_apply')),
  'public_execute',(select exists(select 1 from pg_proc p,aclexplode(p.proacl) a where p.proname in ('calendar_event_list','calendar_event_apply') and a.grantee=0 and a.privilege_type='EXECUTE')),
  'rls',(select bool_and(relrowsecurity) from pg_class where relname in ('user_calendar_events','user_calendar_mutations')))`));
 expect(state).toEqual({anon:false,invoker:true,public_execute:false,rls:true});
});

it('rejects malformed direct RPC payloads before mutation even when SQL fields are missing or null',async()=>{
 const db=fixture.forUser(USER_A),input=fixtureCreate();
 const created=await mutateCalendarEvent(db,input);
 const malformed=[
  {...fixtureCreate(),draft:{...fixtureDraft(),kind:null}},
  {...fixtureCreate(),draft:{...fixtureDraft(),time:{...fixtureDraft().time,timeZone:null}}},
  {operation:'update',eventId:created.event.id,idempotencyKey:randomUUID(),draft:fixtureDraft({title:'Unversioned overwrite'})}
 ];
 for(const body of malformed){
  const response=await db.rpc('calendar_event_apply',{p_input:body});
  expect(response.data).toMatchObject({ok:false,code:'INVALID_INPUT'});
 }
 expect((await listCalendarEvents(db,fixtureRange)).events.find(e=>e.id===created.event.id)?.version).toBe(1);
});
