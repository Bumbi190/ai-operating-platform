import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const instance='50000000-0000-4000-8000-000000000001';
const read=(body:string)=>f.sql(body);
const revision=()=>read(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}'`);
const wake=()=>read(`select wake_at from public.workflow_instances where id='${instance}'`);
const evidence=()=>read(`select count(*) from public.workflow_evidence where instance_id='${instance}'`);
const tick=(outcome:string,next:string|null,detail='{}')=>`select public.workflow_record_tick('${instance}','${outcome}','${detail}'::jsonb,${next?"'"+next+"'::timestamptz":'null'});`;
beforeAll(()=>{
 f=initializeCalendarDb();
 read(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));
 read(`create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),status text not null default 'active',current_state text not null default 'ready',wake_at timestamptz,last_tick_at timestamptz,last_tick_outcome text);
 create table public.workflow_evidence(instance_id uuid not null,state text not null,check_key text not null,result text not null,source text not null,detail jsonb not null);
 insert into public.workflow_instances(id,project_id) values('${instance}','${PROJECT_A}')`);
 read(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-wake-trigger-candidate.sql'),'utf8'));
 read(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-actual-rpcs-candidate.sql'),'utf8'));
 read(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-record-tick-candidate.sql'),'utf8'));
},60000);
afterAll(()=>f?.close(),60000);
describe('real-shaped workflow_record_tick with source revision lock',()=>{
 it('keeps tick RPC service_role-only',()=>{
  expect(read("select has_function_privilege('authenticated','public.workflow_record_tick(uuid,text,jsonb,timestamptz)','EXECUTE')")).toBe('f');
  expect(read("select has_function_privilege('service_role','public.workflow_record_tick(uuid,text,jsonb,timestamptz)','EXECUTE')")).toBe('t');
  expect(()=>f.sql(tick('waiting','2026-11-24T08:00:00Z'),USER_A)).toThrow(/permission denied/i);
 });
 it('rejects absent source revision without any update or evidence',()=>{
  expect(()=>read(tick('waiting','2026-11-24T08:00:00Z'))).toThrow(/MISSING_SOURCE_REVISION/);
  expect(wake()).toBe('');expect(evidence()).toBe('0');
 });
 it('updates wake time and evidence atomically and preserves original result',()=>{
  read(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);
  read(tick('waiting','2026-11-24T08:00:00Z','{"test":"ok"}'));
  expect(wake()).toContain('2026-11-24');expect(revision()).toBe('2');expect(evidence()).toBe('1');
  expect(read("select check_key||':'||result||':'||(detail->>'outcome') from public.workflow_evidence")).toBe('scheduler.evaluation:pass:waiting');
 });
 it('does not bump or re-audit when an unchanged outcome and wake are recorded',()=>{
  read(tick('waiting','2026-11-24T08:00:00Z'));
  expect(revision()).toBe('2');expect(evidence()).toBe('1');
 });
 it('logs failure and clearing the wake; rolls back both on a later SQL error',()=>{
  expect(()=>read(tick('failed',null)+'select 1/0;')).toThrow();
  expect(revision()).toBe('2');expect(evidence()).toBe('1');expect(wake()).toContain('2026-11-24');
  read(tick('failed',null));expect(revision()).toBe('3');expect(evidence()).toBe('2');expect(wake()).toBe('');
  expect(read("select result||':'||(detail->>'previous_outcome') from public.workflow_evidence where check_key='scheduler.evaluation' order by (detail->>'outcome'='failed') desc limit 1")).toBe('fail:waiting');
 });
});
