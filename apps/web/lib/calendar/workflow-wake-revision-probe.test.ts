import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{f=initializeCalendarDb();for(const file of ['source-revision-probe.sql','workflow-wake-revision-probe.sql'])f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));},60000);
afterAll(()=>f?.close(),60000);
const revision=()=>f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}'`);
const wake=()=>f.sql(`select wake_at from public.calendar_workflow_wake_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}'`);
const call=(time:string,fail=false,actor=USER_A)=>f.sql(`select public.calendar_workflow_wake_revision_probe('${PROJECT_A}','${time}'::timestamptz,${fail})`,actor);
describe('isolated workflow wake and calendar revision atomicity',()=>{
 it('rejects a missing revision without storing a wake',()=>{expect(()=>call('2026-11-12T08:00:00Z')).toThrow(/MISSING_SOURCE_REVISION/);expect(wake()).toBe('');});
 it('commits wake and source revision together',()=>{f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);expect(call('2026-11-12T08:00:00Z')).toBe('2');expect(revision()).toBe('2');expect(wake()).toContain('2026-11-12');});
 it('rolls back both wake and revision on a late failure',()=>{expect(()=>call('2026-11-13T08:00:00Z',true)).toThrow(/INJECTED_FAILURE/);expect(revision()).toBe('2');expect(wake()).toContain('2026-11-12');});
 it('rejects another user without changing either record',()=>{expect(()=>call('2026-11-14T08:00:00Z',false,USER_B)).toThrow();expect(revision()).toBe('2');expect(wake()).toContain('2026-11-12');});
});
