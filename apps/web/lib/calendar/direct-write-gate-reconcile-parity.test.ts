import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const load=(p:string)=>readFileSync(resolve(process.cwd(),p),'utf8')
 .replaceAll('\r\n','\n');
const prior=load('lib/calendar/social-reconcile-revision-candidate.sql');
const converted=load('lib/calendar/direct-write-gate-reconcile-integration-probe.sql');
const migration=load('supabase/migrations/20261018071209_social_schedule_batches.sql');
const initial=load('supabase/migrations/20261018070155_social_publication_reconciliation.sql');
const gate=load('lib/calendar/direct-write-gate-probe.sql');
const name='create or replace function public.social_publication_reconciliation_complete(';
const part=(sql:string)=>{
 const begin=sql.indexOf(name),end=sql.indexOf('end $fn$;',begin);
 if(begin<0||end<0)throw Error('missing social reconciliation SQL');
 return sql.slice(begin,end+'end $fn$;'.length);
};
describe('effective reconciliation function is preserved by signed-source conversion',()=>{
 it('uses the last social-aware migration definition, not the earlier manual-only RPC',()=>{
  expect(migration.indexOf(name)).toBeGreaterThan(-1);
  expect(initial.indexOf('create function public.social_publication_reconciliation_complete('))
   .toBeGreaterThan(-1);
  expect(part(migration)).toContain("if r.authority_source='scheduled' then");
  expect(part(migration)).toContain("'receipt_reconciled'");
 });
 it('substitutes signed source begin and removes prior manual source bump only',()=>{
  const expected=part(prior)
   .replace('calendar_social_source_lock_probe(p_principal,p_input)',
    "calendar_source_gate_begin_probe((p_input->>'projectId')::uuid)")
   .replace(' perform public.calendar_social_source_bump_probe(p_principal,p_input);\n','');
  expect(part(converted)).toBe(expected);
 });
 it('takes signed source lock before inspector project/publication locks',()=>{
  const sql=part(converted);
  expect(sql.indexOf('calendar_source_gate_begin_probe')).toBeLessThan(
   sql.indexOf('social_publication_reconciliation_inspect'));
  expect(sql).toContain("if r.state='published' then");
  expect(sql).toContain("if r.state<>'uncertain' or r.version<>p.version");
 });
 it('relies on exactly two AFTER row trigger bumps for a changed scheduled publication/job',()=>{
  const sql=part(converted);
  expect(sql).toContain('update public.social_publications set');
  expect(sql).toContain('update public.social_schedule_jobs set');
  expect(sql).not.toContain('calendar_social_source_bump_probe(');
  expect(gate).toContain('create trigger calendar_gate_publications_after_probe');
  expect(gate).toContain('create trigger calendar_gate_jobs_after_probe');
 });
 it('flags reconciliation proof creation as still OUTSIDE the two-table gate',()=>{
  const proof='public.social_publication_reconciliation_proofs';
  expect(initial).toContain('grant select,insert on '+proof+' to service_role');
  expect(gate).not.toContain('on '+proof);
  expect(converted).not.toContain('create trigger');
 });
});
