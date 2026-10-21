import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const file=(name:string)=>readFileSync(resolve(process.cwd(),'lib/calendar/'+name),'utf8')
 .replaceAll('\r\n','\n');
const previous=file('social-worker-step-recovery-candidate.sql');
const candidate=file('direct-write-gate-worker-recovery-integration-probe.sql');
const parentGate=file('direct-write-gate-probe.sql');
const names=[
 'social_schedule_locked_claim','social_schedule_step','social_schedule_recover_checkpoint'
] as const;
function extract(source:string,name:string){
 const marker='create or replace function public.'+name+'(';
 const start=source.indexOf(marker),end=source.indexOf('end $fn$;',start);
 if(start<0||end<0)throw Error('Missing SQL body '+name);
 return source.slice(start,end+'end $fn$;'.length);
}
describe('signed worker step and recovery source parity',()=>{
 it('locked_claim retains the original CAS and lease checks, changing only source gate',()=>{
  const actual=extract(candidate,'social_schedule_locked_claim')
   .replace('calendar_source_gate_begin_probe(project)',
    'calendar_social_worker_source_lock_probe(project)');
  expect(actual).toBe(extract(previous,'social_schedule_locked_claim'));
  expect(actual).toContain('j.lease_expires_at<=public.social_schedule_now()');
 });
 it('social_schedule_step matches the previous candidate, excluding explicit source bump',()=>{
  const before=extract(previous,'social_schedule_step')
   .replace(' perform public.calendar_social_worker_source_bump_probe(j.project_id);\n','');
  const actual=extract(candidate,'social_schedule_step');
  expect(actual).toBe(before);
  expect(actual).toContain("'receipt_unavailable'");
  expect(actual).toContain("if next_state is null then return");
 });
 it('checkpoint recovery retains exactly the original uncertain/terminal behavior',()=>{
  const before=extract(previous,'social_schedule_recover_checkpoint')
   .replace('calendar_social_worker_source_lock_probe(project)',
    'calendar_source_gate_begin_probe(project)')
   .replace(' perform public.calendar_social_worker_source_bump_probe(j.project_id);\n','');
  const actual=extract(candidate,'social_schedule_recover_checkpoint');
  expect(actual).toBe(before);
  expect(actual).toContain("if r.state in ('creating','publishing') then");
  expect(actual).toContain("'checkpoint_recovered'");
 });
 it('locks source before project/job; triggered changes are the ONLY source-bump mechanism',()=>{
  for(const name of ['social_schedule_locked_claim','social_schedule_recover_checkpoint']){
   const body=extract(candidate,name);
   expect(body.indexOf('calendar_source_gate_begin_probe(project)')).toBeLessThan(
    body.indexOf('from public.projects where id=project for update'));
  }
  for(const name of names){
   const body=extract(candidate,name);
   expect(body).not.toContain('calendar_social_worker_source_bump_probe(');
   expect(body).not.toContain('calendar_source_gate_bump_probe(');
  }
  for(const trigger of ['calendar_gate_publications_after_probe','calendar_gate_jobs_after_probe'])
   expect(parentGate).toContain('create trigger '+trigger);
 });
});
