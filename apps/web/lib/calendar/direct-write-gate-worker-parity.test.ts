import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const read=(name:string)=>readFileSync(resolve(process.cwd(),'lib/calendar/'+name),'utf8')
 .replaceAll('\r\n','\n');
const previous=read('social-worker-claim-revision-candidate.sql');
const candidate=read('direct-write-gate-worker-integration-probe.sql');
const gate=read('direct-write-gate-probe.sql');
const extraction=(sql:string)=>{
 const marker='create or replace function public.social_schedule_claim(';
 const start=sql.indexOf(marker);
 const end=sql.indexOf('end $fn$;',start);
 if(start<0||end<0)throw Error('Social worker claim SQL function not found');
 return sql.slice(start,end+'end $fn$;'.length);
};
describe('signed social worker claim preserves original claim/recovery state machine',()=>{
 it('changes only source-version try-lock and removes the prior explicit bumps',()=>{
  const restored=extraction(candidate)
   .replace('public.calendar_source_gate_try_begin_probe(candidate.project_id)',
    'public.calendar_social_worker_try_source_lock_probe(candidate.project_id)');
  const old=extraction(previous).replaceAll(
   '   perform public.calendar_social_worker_source_bump_probe(candidate.project_id);\n','')
   .replaceAll('  perform public.calendar_social_worker_source_bump_probe(candidate.project_id);\n','');
  expect(restored).toBe(old);
 });
 it('worker skips locked sources and retains original fail-closed uncertain handling',()=>{
  const sql=extraction(candidate);
  expect(sql).toContain('if not public.calendar_source_gate_try_begin_probe(candidate.project_id)');
  expect(sql).toContain('for update skip locked');
  expect(sql).toContain("if r.state in ('creating','publishing') then");
  expect(sql).toContain("state='uncertain'");
  expect(sql).toContain("'receipt_unavailable'");
  expect(sql).toContain("'lease_recovered'");
 });
 it('reuses guarded AFTER row triggers instead of an unguarded bump',()=>{
  const sql=extraction(candidate);
  expect(sql).not.toContain('calendar_social_worker_source_bump_probe(');
  expect(sql).not.toContain('calendar_source_gate_bump_probe(');
  for(const name of ['calendar_gate_jobs_after_probe',
   'calendar_gate_publications_after_probe'])
   expect(gate).toContain('create trigger '+name);
  expect((sql.match(/calendar_source_gate_try_begin_probe\(candidate\.project_id\)/g)??[]).length)
   .toBe(1);
 });
});
