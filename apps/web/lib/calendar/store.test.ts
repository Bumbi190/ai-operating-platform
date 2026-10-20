import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {initializeCalendarDb,USER_A,USER_EMPTY,PROJECT_A,PROJECT_B,TASK_A,TASK_B} from './test-db';
import {fixtureCreate,fixtureDraft,fixtureRange} from './fixtures.test-utils';
import {listCalendarEvents,mutateCalendarEvent} from './store';
let fixture:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{fixture=initializeCalendarDb()},30000);afterAll(()=>fixture?.close());
describe('durable calendar SQL',()=>{
 it('reloads, updates, cancels and restores the same private meeting',async()=>{
  const db=fixture.forUser(USER_A),created=await mutateCalendarEvent(db,fixtureCreate());
  expect(created.event.version).toBe(1);expect(created.calendarHref).toBe('/calendar?week=2026-10-19');
  expect((await listCalendarEvents(db,fixtureRange)).events.find(e=>e.id===created.event.id)).toEqual(created.event);
  const changed=await mutateCalendarEvent(db,{operation:'update',eventId:created.event.id,expectedVersion:1,idempotencyKey:randomUUID(),draft:fixtureDraft({title:'Flyttat möte'})});
  expect(changed.event.title).toBe('Flyttat möte');expect(changed.event.version).toBe(2);
  const cancelled=await mutateCalendarEvent(db,{operation:'cancel',eventId:created.event.id,expectedVersion:2,idempotencyKey:randomUUID()});
  expect(cancelled.event.status).toBe('cancelled');
  const restored=await mutateCalendarEvent(db,{operation:'restore',eventId:created.event.id,expectedVersion:3,idempotencyKey:randomUUID()});
  expect(restored.event.status).toBe('scheduled');expect(restored.event.version).toBe(4);
 });
 it('returns the same receipt on a retry and conflicts when its content changes',async()=>{
  const db=fixture.forUser(USER_A),input=fixtureCreate(),first=await mutateCalendarEvent(db,input);
  expect(await mutateCalendarEvent(db,input)).toEqual(first);
  expect((await listCalendarEvents(db,fixtureRange)).events.filter(e=>e.id===first.event.id)).toHaveLength(1);
  await expect(mutateCalendarEvent(db,{...input,draft:fixtureDraft({title:'Annat innehåll'})} as typeof input)).rejects.toMatchObject({code:'CONFLICT'});
 });
 it('lets exactly one of two real simultaneous updates win',async()=>{
  const db=fixture.forUser(USER_A),created=await mutateCalendarEvent(db,fixtureCreate());
  const outcomes=await Promise.allSettled(['Första','Andra'].map(title=>mutateCalendarEvent(db,{operation:'update',eventId:created.event.id,expectedVersion:1,idempotencyKey:randomUUID(),draft:fixtureDraft({title})})));
  expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);
  expect(outcomes.filter(o=>o.status==='rejected').map(o=>o.status==='rejected'&&o.reason.code)).toEqual(['CONFLICT']);
  expect((await listCalendarEvents(db,fixtureRange)).events.find(e=>e.id===created.event.id)?.version).toBe(2);
 });
 it('keeps a private calendar available without any project',async()=>{
  const db=fixture.forUser(USER_EMPTY),created=await mutateCalendarEvent(db,fixtureCreate());
  expect((await listCalendarEvents(db,fixtureRange)).events.map(e=>e.id)).toEqual([created.event.id]);
 });
 it('rejects foreign project and task references and saves work progress',async()=>{
  const db=fixture.forUser(USER_A);
  for(const patch of [{projectId:PROJECT_B},{projectId:PROJECT_A,taskId:TASK_B}]){
   await expect(mutateCalendarEvent(db,fixtureCreate(patch))).rejects.toMatchObject({code:'INVALID_INPUT'});
  }
  const created=await mutateCalendarEvent(db,fixtureCreate({kind:'work_block',projectId:PROJECT_A,taskId:TASK_A,workStatus:'planned'}));
  for(const workStatus of ['in_progress','done'] as const){
   const current=(await listCalendarEvents(db,fixtureRange)).events.find(e=>e.id===created.event.id)!;
   const changed=await mutateCalendarEvent(db,{operation:'update',eventId:current.id,expectedVersion:current.version,idempotencyKey:randomUUID(),draft:fixtureDraft({kind:'work_block',projectId:PROJECT_A,taskId:TASK_A,workStatus})});
   expect(changed.event.workStatus).toBe(workStatus);
  }
 });
});
