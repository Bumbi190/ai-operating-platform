import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const A='50000000-0000-4000-8000-000000000001';
const B='50000000-0000-4000-8000-000000000002';
const due='2026-09-01T08:00:00Z';
const claim=()=>f.sql('select id from public.workflow_claim_due(20,300)');
const revision=(owner:string,project:string)=>f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${owner}' and project_id='${project}'`);
const wake=(id:string)=>f.sql(`select wake_at from public.workflow_instances where id='${id}'`);
beforeAll(()=>{
 f=initializeCalendarDb();
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));
 f.sql(`alter table public.projects add column execution_paused boolean not null default false;
 create table public.platform_config(id integer primary key,automation_paused boolean not null default false);
 insert into public.platform_config(id) values(1);
 create table public.workflow_instances(
 id uuid primary key,project_id uuid not null references public.projects(id),
 status text not null default 'active',wake_at timestamptz,last_tick_at timestamptz);
 insert into public.workflow_instances(id,project_id,wake_at) values('${A}','${PROJECT_A}','${due}')`);
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-wake-trigger-candidate.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-claim-due-revision-candidate.sql'),'utf8'));
},60000);
afterAll(()=>f?.close(),60000);
describe('later workflow_claim_due + calendar source-revision candidate',()=>{
 it('preserves service_role-only RPC permission',()=>{
   expect(f.sql("select has_function_privilege('authenticated','public.workflow_claim_due(integer,integer)','EXECUTE')")).toBe('f');
   expect(f.sql("select has_function_privilege('service_role','public.workflow_claim_due(integer,integer)','EXECUTE')")).toBe('t');
   expect(()=>f.sql('select id from public.workflow_claim_due(20,300)',USER_A)).toThrow(/permission denied/i);
 });
 it('fails closed on missing source version before claiming an instance',()=>{
   expect(()=>claim()).toThrow(/MISSING_SOURCE_REVISION/);
   expect(wake(A)).toContain('2026-09-01');
 });
 it('fails closed when a source revision is associated with the wrong owner',()=>{
   f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_B}','${PROJECT_A}',1)`);
   expect(()=>claim()).toThrow(/MISSING_SOURCE_REVISION/);
   expect(wake(A)).toContain('2026-09-01');
   f.sql(`delete from public.calendar_source_revision_probe where owner_user_id='${USER_B}' and project_id='${PROJECT_A}'`);
 });
 it('preserves global and project pause checks',()=>{
   f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);
   f.sql('update public.platform_config set automation_paused=true where id=1');
   expect(claim()).toBe('');
   expect(revision(USER_A,PROJECT_A)).toBe('1');
   f.sql('update public.platform_config set automation_paused=false where id=1');
   f.sql(`update public.projects set execution_paused=true where id='${PROJECT_A}'`);
   expect(claim()).toBe('');
   expect(revision(USER_A,PROJECT_A)).toBe('1');
   f.sql(`update public.projects set execution_paused=false where id='${PROJECT_A}'`);
 });
 it('claims due workflow, moves wake forward, bumps source revision',()=>{
   expect(claim()).toBe(A);
   expect(revision(USER_A,PROJECT_A)).toBe('2');
   expect(Date.parse(wake(A))).toBeGreaterThan(Date.now());
   expect(f.sql(`select last_tick_at is not null from public.workflow_instances where id='${A}'`)).toBe('t');
 });
 it('does not re-claim a wake already moved into the future',()=>{
   expect(claim()).toBe('');
   expect(revision(USER_A,PROJECT_A)).toBe('2');
 });
 it('claims a second project with a distinct owner revision',()=>{
   f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_B}','${PROJECT_B}',1)`);
   f.sql(`insert into public.workflow_instances(id,project_id,wake_at) values('${B}','${PROJECT_B}','${due}')`);
   expect(claim()).toBe(B);
   expect(revision(USER_A,PROJECT_A)).toBe('2');
   expect(revision(USER_B,PROJECT_B)).toBe('2');
 });
});
