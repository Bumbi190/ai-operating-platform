import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {initializeCalendarSocialDb} from './social-fixtures.test-utils';
import {USER_EMPTY} from './test-db';
import {fixtureCreate,fixtureDraft,fixtureRange} from './fixtures.test-utils';
import {listCalendarEvents} from './store';
import {handleCalendarTool,CALENDAR_TOOLS,CALENDAR_TOOL_NAMES,CALENDAR_GUIDE,persistCalendarToolData} from './atlas-tools';
import type {CalendarReceipt,CalendarReadDeps} from './types';
let fixture:ReturnType<typeof initializeCalendarSocialDb>;
const conversationId='50000000-0000-4000-8000-000000000003';
beforeAll(()=>{fixture=initializeCalendarSocialDb();fixture.sql("insert into conversations(id,user_id) values('"+conversationId+"','"+USER_EMPTY+"')")},60000);
afterAll(()=>{fixture?.close();vi.unstubAllEnvs()});
const context=(inputSource:'text'|'voice')=>({actor:{userId:USER_EMPTY,allowedProjectIds:[] as string[]},conversationId,inputSource});
const deps=():CalendarReadDeps=>({sessionDb:fixture.forUser(USER_EMPTY),adminDb:fixture.adminDb});
it.each(['text','voice'] as const)('saves, updates and cancels through the same %s tool path',async inputSource=>{
 const c=context(inputSource),input=fixtureCreate();
 const created=await handleCalendarTool('create_calendar_event',{eventId:input.eventId,idempotencyKey:input.idempotencyKey,draft:fixtureDraft()},c,deps()) as CalendarReceipt;
 expect(created.ok).toBe(true);
 expect(await handleCalendarTool('create_calendar_event',{eventId:input.eventId,idempotencyKey:input.idempotencyKey,draft:fixtureDraft()},c,deps())).toEqual(created);
 const updated=await handleCalendarTool('update_calendar_event',{mode:'manual',mutation:{operation:'update',eventId:created.event.id,expectedVersion:1,idempotencyKey:randomUUID(),draft:fixtureDraft({title:'Flyttat via '+inputSource})}},c,deps()) as CalendarReceipt;
 expect(updated.event.version).toBe(2);
 const cancelled=await handleCalendarTool('cancel_calendar_event',{eventId:created.event.id,expectedVersion:2,idempotencyKey:randomUUID()},c,deps()) as CalendarReceipt;
 expect(cancelled.event.status).toBe('cancelled');
 const view=await handleCalendarTool('get_calendar',fixtureRange,c,deps());
 expect(JSON.stringify(view)).not.toContain(USER_EMPTY);
},30000);
it('refuses a missing or foreign conversation before any calendar read or write',async()=>{
 const before=(await listCalendarEvents(fixture.forUser(USER_EMPTY),fixtureRange)).events.length;
 for(const id of [null,'50000000-0000-4000-8000-000000000001']){
  const input=fixtureCreate(),result=await handleCalendarTool('create_calendar_event',{eventId:input.eventId,idempotencyKey:input.idempotencyKey,draft:fixtureDraft()},{...context('voice'),conversationId:id},deps());
  expect(result).toMatchObject({ok:false});
 }
 expect((await listCalendarEvents(fixture.forUser(USER_EMPTY),fixtureRange)).events).toHaveLength(before);
});
it('does not write an ambiguous title target or an owner supplied by the model',async()=>{
 const before=(await listCalendarEvents(fixture.forUser(USER_EMPTY),fixtureRange)).events.length;
 expect(await handleCalendarTool('update_calendar_event',{targetTitle:'Oscar',localMinute:'2026-10-23T10:00'},context('text'),deps())).toMatchObject({ok:false,code:'INVALID_INPUT'});
 expect(await handleCalendarTool('create_calendar_event',{...fixtureCreate(),ownerUserId:USER_EMPTY},context('text'),deps())).toMatchObject({ok:false,code:'INVALID_INPUT'});
 expect((await listCalendarEvents(fixture.forUser(USER_EMPTY),fixtureRange)).events).toHaveLength(before);
});
it('registers only the four interactive calendar tools and retains no private draft in tool persistence',async()=>{
 expect(CALENDAR_TOOL_NAMES).toEqual(['get_calendar','create_calendar_event','update_calendar_event','cancel_calendar_event']);
 expect(CALENDAR_TOOLS).toHaveLength(4);expect(JSON.stringify(CALENDAR_TOOLS)).not.toContain('ownerUserId');expect(CALENDAR_GUIDE).toContain('följdfråga');
 const created=await handleCalendarTool('create_calendar_event',{eventId:randomUUID(),idempotencyKey:randomUUID(),draft:fixtureDraft({title:'Hemlig titel',description:'Hemlig anteckning'})},context('text'),deps());
 const saved=persistCalendarToolData({draft:fixtureDraft({title:'Hemlig titel',description:'Hemlig anteckning'})},created);
 expect(JSON.stringify(saved)).not.toContain('Hemlig');expect(saved.result).toMatchObject({ok:true});
});

it('keeps calendar intents on the tool path and reports malformed read input as a failure',async()=>{
 const {isCalendarIntent}=await import('./atlas-tools');
 for(const text of ['Boka ett möte med Oscar','Flytta mötet till fredag','Vad har jag nästa vecka?'])expect(isCalendarIntent(text)).toBe(true);
 expect(isCalendarIntent('Skriv en Facebooktext om hösten')).toBe(false);
 await expect(handleCalendarTool('get_calendar',{...fixtureRange,fromDate:'2026-02-30'},context('text'),deps())).resolves.toMatchObject({ok:false,code:'INVALID_INPUT'});
});

it('reports malformed read input as a structured failure',async()=>{
 await expect(handleCalendarTool('get_calendar',{...fixtureRange,fromDate:'2026-02-30'},context('text'),deps())).resolves.toMatchObject({ok:false,code:'INVALID_INPUT'});
});
it('emits refresh metadata from the real saved social proposal',async()=>{
 const {scheduleFixture}=await import('../social-launch/scheduling/fixtures.test-utils');
 const {readCalendarSocial}=await import('./source-social');
 const {stockholmDate,stockholmMinute,weekRange}=await import('./time');
 const {calendarChangedForResult}=await import('./stream-effect');
 const f=await scheduleFixture(fixture.adminDb);
 const entry=(await readCalendarSocial(fixture.adminDb,f.principal,weekRange(stockholmDate(f.dueAt)))).entries[0];
 const result=await handleCalendarTool('update_calendar_event',{mode:'source_move',source:entry.source,localMinute:stockholmMinute(new Date(Date.parse(f.dueAt)+86400000).toISOString()),idempotencyKey:randomUUID()},{actor:f.principal,conversationId:'50000000-0000-4000-8000-000000000001',inputSource:'voice'},{sessionDb:fixture.forUser(f.principal.userId),adminDb:fixture.adminDb});
 expect(result).toMatchObject({ok:true,reviewRequired:true});
 expect(calendarChangedForResult('update_calendar_event',result,'50000000-0000-4000-8000-000000000001')).not.toBeNull();
},30000);
