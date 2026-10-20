import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const instance='50000000-0000-4000-8000-000000000001';
beforeAll(()=>{f=initializeCalendarDb();f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));f.sql(`create table public.workflow_instances(id uuid primary key, project_id uuid not null references public.projects(id),wake_at timestamptz);insert into public.workflow_instances values('${instance}','${PROJECT_A}',null)`);f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-wake-trigger-candidate.sql'),'utf8'));},60000);
afterAll(()=>f?.close(),60000);
const revision=()=>f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}'`);
const wake=()=>f.sql(`select wake_at from public.workflow_instances where id='${instance}'`);
const change=(time:string|null)=>f.sql(`update public.workflow_instances set wake_at=${time?"'"+time+"'::timestamptz":'null'} where id='${instance}'`);
describe('test-only workflow wake trigger catches real-shaped updates',()=>{
 it('refuses wake change when source revision is missing',()=>{expect(()=>change('2026-11-20T08:00:00Z')).toThrow(/MISSING_SOURCE_REVISION/);expect(wake()).toBe('');});
 it('increments the revision exactly when wake changes',()=>{f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);change('2026-11-20T08:00:00Z');expect(revision()).toBe('2');change('2026-11-20T08:00:00Z');expect(revision()).toBe('2');change(null);expect(revision()).toBe('3');});
 it('rolls back both revision and wake update on later failure',()=>{expect(()=>f.sql(`update public.workflow_instances set wake_at='2026-11-21T09:00:00Z' where id='${instance}';select 1/0`)).toThrow();expect(revision()).toBe('3');expect(wake()).toBe('');});
});
