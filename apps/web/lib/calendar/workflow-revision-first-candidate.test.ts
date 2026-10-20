import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const instance='50000000-0000-4000-8000-000000000001';
beforeAll(()=>{f=initializeCalendarDb();f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));f.sql(`create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),wake_at timestamptz);insert into public.workflow_instances values('${instance}','${PROJECT_A}',null)`);f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-wake-trigger-candidate.sql'),'utf8'));f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-revision-first-candidate.sql'),'utf8'));},60000);
afterAll(()=>f?.close(),60000);
const call=(time:string|null)=>`select public.calendar_workflow_wake_revision_first_probe('${instance}',${time?"'"+time+"'::timestamptz":'null'});`;
const revision=()=>f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}'`);
describe('revision-first workflow writer candidate',()=>{
 it('fails closed if source revision does not exist',()=>{expect(()=>f.sql(call('2026-11-22T08:00:00Z'))).toThrow(/MISSING_SOURCE_REVISION/);});
 it('updates wake and version, but only once for unchanged values',()=>{f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);f.sql(call('2026-11-22T08:00:00Z'));expect(revision()).toBe('2');f.sql(call('2026-11-22T08:00:00Z'));expect(revision()).toBe('2');});
 it('does not expose the service-only RPC to an authenticated user',()=>{expect(()=>f.sql(call('2026-11-22T09:00:00Z'),USER_A)).toThrow(/permission denied/i);expect(revision()).toBe('2');});
});
