import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const file=readFileSync(resolve(process.cwd(),'supabase/migrations/20260829_workflow_scheduled_continuation.sql'),'utf8');
const fn=(name:string)=>{const start=file.indexOf('create or replace function public.'+name+'(');expect(start).toBeGreaterThan(-1);const end=file.indexOf('$$;',start);expect(end).toBeGreaterThan(start);return file.slice(start,end+3);};
describe('workflow scheduling writer integration requirements',()=>{
 it('wake writer changes wake_at and writes durable evidence within its SQL transaction',()=>{const source=fn('workflow_schedule_wake');expect(source).toMatch(/for update/i);expect(source).toMatch(/update public\.workflow_instances set wake_at = p_wake_at/i);expect(source).toMatch(/insert into public\.workflow_evidence/i);});
 it('clear writer changes wake_at and logs nonempty prior values',()=>{const source=fn('workflow_clear_wake');expect(source).toMatch(/for update/i);expect(source).toMatch(/set wake_at = null/i);expect(source).toMatch(/if prev is not null/i);});
 it('both functions must still adopt the new source revision gate',()=>{for(const name of ['workflow_schedule_wake','workflow_clear_wake']){const source=fn(name);expect(source).not.toContain('calendar_source_revision_probe');expect(file).toMatch(new RegExp('grant execute on function public\\.'+name+'\\([^;]+to service_role','i'));}});
});
