import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const instance='50000000-0000-4000-8000-000000000001';
const iso='2026-11-24T08:00:00Z';
const call=(name:string,at?:string)=>name==='schedule'?`select (public.workflow_schedule_wake('${instance}','${at}'::timestamptz,'Atlas','test')).id;`:`select (public.workflow_clear_wake('${instance}','Atlas','test')).id;`;
const revision=()=>f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}'`);
const wake=()=>f.sql(`select wake_at from public.workflow_instances where id='${instance}'`);
const evidence=()=>f.sql(`select count(*) from public.workflow_evidence where instance_id='${instance}'`);
beforeAll(()=>{
 f=initializeCalendarDb();
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));
 f.sql(`create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),status text not null default 'active',current_state text not null default 'ready',wake_at timestamptz);
 create table public.workflow_evidence(instance_id uuid not null,state text not null,check_key text not null,result text not null,source text not null,detail jsonb not null);
 insert into public.workflow_instances(id,project_id) values('${instance}','${PROJECT_A}')`);
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-wake-trigger-candidate.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-actual-rpcs-candidate.sql'),'utf8'));
},60000);
afterAll(()=>f?.close(),60000);
describe('original workflow RPC behavior with revision-first source locking in isolated DB',()=>{
 it('preserves service-only permissions for both functions',()=>{
  for(const signature of ['workflow_schedule_wake(uuid,timestamptz,text,text)','workflow_clear_wake(uuid,text,text)']){
   expect(f.sql(`select has_function_privilege('authenticated','public.${signature}','EXECUTE')`)).toBe('f');
   expect(f.sql(`select has_function_privilege('service_role','public.${signature}','EXECUTE')`)).toBe('t');
  }
  expect(()=>f.sql(call('schedule',iso),USER_A)).toThrow(/permission denied/i);
 });
 it('fails closed if the revision row is absent without changing the wake/evidence',()=>{
  expect(()=>f.sql(call('schedule',iso))).toThrow(/MISSING_SOURCE_REVISION/);
  expect(wake()).toBe('');expect(evidence()).toBe('0');
 });
 it('schedules, repeats, and clears with original audit records and correct version increments',()=>{
  f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);
  f.sql(call('schedule',iso));expect(revision()).toBe('2');expect(wake()).toContain('2026-11-24');expect(evidence()).toBe('1');
  expect(f.sql(`select detail->>'actor' from public.workflow_evidence where check_key='scheduler.wake_scheduled' limit 1`)).toBe('Atlas');
  f.sql(call('schedule',iso));expect(revision()).toBe('2');expect(evidence()).toBe('2');
  f.sql(call('clear'));expect(revision()).toBe('3');expect(wake()).toBe('');expect(evidence()).toBe('3');
  f.sql(call('clear'));expect(revision()).toBe('3');expect(evidence()).toBe('3');
 });
 it('rolls back both wake and audit/version updates on a late SQL failure',()=>{
  expect(()=>f.sql(call('schedule','2026-11-24T09:00:00Z')+'select 1/0;')).toThrow();
  expect(revision()).toBe('3');expect(wake()).toBe('');expect(evidence()).toBe('3');
 });
 it('refuses scheduling a completed workflow while leaving version and evidence intact',()=>{
  f.sql(`update public.workflow_instances set status='complete' where id='${instance}'`);
  expect(()=>f.sql(call('schedule',iso))).toThrow(/cannot be scheduled/);
  expect(revision()).toBe('3');expect(evidence()).toBe('3');
 });
});
