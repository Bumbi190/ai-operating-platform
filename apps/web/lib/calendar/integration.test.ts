import {beforeAll,afterAll,beforeEach,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {initializeCalendarSocialDb} from './social-fixtures.test-utils';
import {USER_A,USER_EMPTY} from './test-db';
import {fixtureCreate,fixtureDraft,fixtureRange} from './fixtures.test-utils';
import {resolveCalendarAccess} from './access';
import {calendarApi} from './api';
import {handleCalendarTool} from './atlas-tools';
import {readCalendarWeek} from './read';
import {readCalendarSocial} from './source-social';
import {stockholmDate,stockholmMinute,weekRange} from './time';
import {scheduleFixture} from '../social-launch/scheduling/fixtures.test-utils';
import {approveSchedule} from '../social-launch/scheduling/store';
import type {CalendarReceipt} from './types';
vi.mock('./access',()=>({resolveCalendarAccess:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>fixture.adminDb}));
let fixture:ReturnType<typeof initializeCalendarSocialDb>;
const conversationId='50000000-0000-4000-8000-000000000003';
beforeAll(()=>{fixture=initializeCalendarSocialDb();fixture.sql("insert into conversations(id,user_id) values('"+conversationId+"','"+USER_EMPTY+"')")},60000);
beforeEach(()=>vi.mocked(resolveCalendarAccess).mockResolvedValue({ok:true,actor:{userId:USER_EMPTY,allowedProjectIds:[]},sessionDb:fixture.forUser(USER_EMPTY)}));
afterAll(()=>{fixture?.close();vi.unstubAllEnvs()});
const post=(body:unknown)=>calendarApi(new Request('https://calendar.test/api/calendar',{method:'POST',headers:{origin:'https://calendar.test',host:'calendar.test','Content-Type':'application/json'},body:JSON.stringify(body)}));
it.each(['text','voice'] as const)('shares persisted IDs and work status across HTTP and Atlas %s',async inputSource=>{
 const actor={userId:USER_EMPTY,allowedProjectIds:[] as string[]},deps={sessionDb:fixture.forUser(USER_EMPTY),adminDb:fixture.adminDb},context={actor,conversationId,inputSource};
 const input=fixtureCreate({kind:'work_block',title:'Planera familjeveckan',workStatus:'planned'});
 const created=await (await post(input)).json() as CalendarReceipt;expect(created.ok).toBe(true);
 const initial=await readCalendarWeek(deps,actor,fixtureRange);
 const entry=initial.entries.find(e=>e.source.kind==='manual'&&e.source.eventId===created.event.id)!;
 expect(entry.manualEvent?.workStatus).toBe('planned');expect(entry.time).toEqual(created.event.time);
 const moved=await handleCalendarTool('update_calendar_event',{mode:'manual',mutation:{operation:'update',eventId:created.event.id,expectedVersion:1,idempotencyKey:randomUUID(),draft:fixtureDraft({kind:'work_block',workStatus:'in_progress',time:{kind:'timed',startUtc:'2026-10-23T08:00:00.000Z',endUtc:'2026-10-23T09:00:00.000Z',timeZone:'Europe/Stockholm'}})}},context,deps) as CalendarReceipt;
 expect(moved.ok).toBe(true);expect(moved.event.id).toBe(created.event.id);
 const reloaded=await (await calendarApi(new Request('https://calendar.test/api/calendar?fromDate=2026-10-19&toDateExclusive=2026-10-26'))).json();
 expect(reloaded.entries.find((e:{id:string})=>e.id===entry.id).manualEvent).toMatchObject({workStatus:'in_progress',version:2,time:{startUtc:'2026-10-23T08:00:00.000Z'}});
 const cancelled=await handleCalendarTool('cancel_calendar_event',{eventId:created.event.id,expectedVersion:2,idempotencyKey:randomUUID()},context,deps) as CalendarReceipt;
 expect(cancelled.event.status).toBe('cancelled');
 expect((await readCalendarWeek(deps,actor,fixtureRange)).entries.find(e=>e.id===entry.id)?.status).toBe('cancelled');
},30000);
it.each([false,true])('proposes a social move without changing queue or approvals (approved=%s)',async approved=>{
 const f=await scheduleFixture(fixture.adminDb);if(approved)await approveSchedule(fixture.adminDb,f.principal,f.approval);
 const snapshot=()=>fixture.testSql("select jsonb_build_object('jobs',(select coalesce(jsonb_agg(to_jsonb(j) order by id),'[]') from social_schedule_jobs j),'decisions',(select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from social_schedule_decisions d));");
 const before=snapshot(),range=weekRange(stockholmDate(f.dueAt)),entry=(await readCalendarSocial(fixture.adminDb,f.principal,range)).entries[0];
 const wanted=new Date(Date.parse(f.dueAt)+3600000).toISOString();
 const receipt=await handleCalendarTool('update_calendar_event',{mode:'source_move',source:entry.source,localMinute:stockholmMinute(wanted),idempotencyKey:randomUUID()},{actor:f.principal,conversationId:'50000000-0000-4000-8000-000000000001',inputSource:approved?'voice':'text'},{sessionDb:fixture.forUser(USER_A),adminDb:fixture.adminDb});
 expect(receipt).toMatchObject({ok:true,reviewRequired:true});expect(snapshot()).toBe(before);
 const next=(await readCalendarSocial(fixture.adminDb,f.principal,range)).entries.find(e=>e.id===entry.id)!;
 if(approved){expect(next.time).toEqual(entry.time);expect(next.pendingChange?.time).toMatchObject({startUtc:wanted});}
 else {expect(next.status).toBe('proposal');expect(next.time).toMatchObject({startUtc:wanted});}
},30000);
