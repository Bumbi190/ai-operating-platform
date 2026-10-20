import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const load=(path:string)=>readFileSync(resolve(process.cwd(),path),'utf8').replaceAll('\r\n','\n');
const original=load('supabase/migrations/20261018071209_social_schedule_batches.sql');
const recovery=load('supabase/migrations/20261018073425_social_schedule_checkpoint_recovery.sql');
const candidate=load('lib/calendar/social-worker-step-recovery-candidate.sql');

function get(source:string,name:string,replaced:boolean){
 const marker='create '+(replaced?'or replace ':'')+'function public.'+name+'(';
 const begin=source.indexOf(marker);
 if(begin<0)throw Error('Function absent: '+name);
 const end=source.indexOf('end $fn$;',begin);
 if(end<0)throw Error('Function unfinished: '+name);
 return source.slice(begin,end+'end $fn$;'.length);
}
describe('social worker step and recovery keep full original safety behavior',()=>{
 it('locked claim changes only its initial source-version lock',()=>{
  const actual=get(candidate,'social_schedule_locked_claim',true)
   .replace('create or replace function','create function')
   .replace(
    ' -- Calendar source version lock MUST precede project and job row locks.\n'+
    ' perform public.calendar_social_worker_source_lock_probe(project);\n','');
  expect(actual).toBe(get(original,'social_schedule_locked_claim',false));
 });
 it('step changes only its final version bump after successful mutable status changes',()=>{
  const actual=get(candidate,'social_schedule_step',true)
   .replace('create or replace function','create function')
   .replace(' perform public.calendar_social_worker_source_bump_probe(j.project_id);\n','');
  const before=get(original,'social_schedule_step',false);
  expect(actual).toBe(before);
  expect(actual).toContain("if r.version<>(p_step->>'expectedVersion')::integer then return");
  expect(actual).toContain("when action='complete' and r.state='publishing' then 'published'");
 });
 it('recovery adds only source lock before project and source bump after evidence',()=>{
  const actual=get(candidate,'social_schedule_recover_checkpoint',true)
   .replace('create or replace function','create function')
   .replace(' -- Block before project row lock while an atomic calendar batch is active.\n'+
    ' perform public.calendar_social_worker_source_lock_probe(project);\n','')
   .replace(' perform public.calendar_social_worker_source_bump_probe(j.project_id);\n','');
  expect(actual).toBe(get(recovery,'social_schedule_recover_checkpoint',false));
  expect(actual).toContain("if r.state in ('creating','publishing') then");
  expect(actual).toContain("if j.state in ('published','failed','uncertain','blocked','cancelled','missed') then return");
 });
 it('both mutating RPCs lock source before project and bump after SQL mutations',()=>{
  const locked=get(candidate,'social_schedule_locked_claim',true);
  const step=get(candidate,'social_schedule_step',true);
  const recover=get(candidate,'social_schedule_recover_checkpoint',true);
  expect(locked.indexOf('calendar_social_worker_source_lock_probe(project)'))
   .toBeLessThan(locked.indexOf('from public.projects where id=project for update'));
  expect(recover.indexOf('calendar_social_worker_source_lock_probe(project)'))
   .toBeLessThan(recover.indexOf('from public.projects where id=project for update'));
  expect(step.indexOf('calendar_social_worker_source_bump_probe(j.project_id)'))
   .toBeGreaterThan(step.indexOf('insert into public.social_schedule_events('));
  expect(recover.indexOf('calendar_social_worker_source_bump_probe(j.project_id)'))
   .toBeGreaterThan(recover.indexOf('insert into public.social_schedule_events('));
 });
});
