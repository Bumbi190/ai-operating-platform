import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const sql=readFileSync(resolve(process.cwd(),'supabase/migrations/20260902081500_stop_atomic_execution_admission.sql'),'utf8');
const mark='create or replace function public.workflow_claim_due(';
const start=sql.indexOf(mark),end=sql.indexOf('$$;',start);
const def=sql.slice(start,end);
describe('calendar source revisions must preserve current workflow stop barrier',()=>{
 it('uses the later workflow_claim_due migration rather than its original definition',()=>{expect(start).toBeGreaterThan(-1);expect(end).toBeGreaterThan(start);});
 it('currently locks instance rows before global and project stop authorities',()=>{
  const instance=def.indexOf('for update skip locked');
  const global=def.indexOf('from public.platform_config pc');
  const project=def.indexOf('from public.projects p where p.id = v_pid for share');
  const update=def.indexOf('update public.workflow_instances w set');
  expect(instance).toBeGreaterThan(0);
  expect(global).toBeGreaterThan(instance);
  expect(project).toBeGreaterThan(global);
  expect(update).toBeGreaterThan(project);
 });
 it('refuses claim execution when the platform is paused and filters paused projects',()=>{
  expect(def).toMatch(/if v_gpaused then\s+return;/);
  expect(def).toMatch(/if not v_ppaused then\s+v_allowed := array_append\(v_allowed, v_pid\)/);
  expect(def).toContain('w.project_id = any(v_allowed)');
 });
});
