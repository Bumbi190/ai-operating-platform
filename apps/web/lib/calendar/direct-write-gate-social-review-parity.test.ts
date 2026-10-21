import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const read=(file:string)=>readFileSync(resolve(process.cwd(),file),'utf8')
 .replaceAll('\r\n','\n');
const migration=read('supabase/migrations/20261018071209_social_schedule_batches.sql');
const previous=read('lib/calendar/social-review-revision-candidate.sql');
const signed=read('lib/calendar/direct-write-gate-social-review-integration-probe.sql');
const gate=read('lib/calendar/direct-write-gate-probe.sql');
function get(s:string,name:string,replaced:boolean){
 const marker='create '+(replaced?'or replace ':'')+'function public.'+name+'(';
 const start=s.indexOf(marker),end=s.indexOf('end $fn$;',start);
 if(start<0||end<0)throw Error('Missing '+name);
 return s.slice(start,end+'end $fn$;'.length);
}
describe('signed social review and cancellation preserve source SQL and count actual writes',()=>{
 it('propose keeps original owner validations and metadata bump, with a signed lock',()=>{
  const expected=get(previous,'social_schedule_propose',true)
   .replace('calendar_social_source_lock_probe(p_principal,p_input)',
    'calendar_source_gate_begin_probe(project)');
  const actual=get(signed,'social_schedule_propose',true);
  expect(actual).toBe(expected);
  expect(actual).toContain('calendar_social_source_bump_probe(p_principal,p_input)');
 });
 it('approve preserves original reviewed manifest and idempotency logic but drops manual bump',()=>{
  const expected=get(previous,'social_schedule_approve',true)
   .replace('calendar_social_source_lock_probe(p_principal,p_input)',
    'calendar_source_gate_begin_probe(project)')
   .replace(' perform public.calendar_social_source_bump_probe(p_principal,p_input);\n','');
  const actual=get(signed,'social_schedule_approve',true);
  expect(actual).toBe(expected);
  expect(actual).not.toContain('calendar_social_source_bump_probe(');
  expect(actual).toContain('jsonb_array_elements(b.manifest');
 });
 it('revoke preserves the original decision and cancellation semantics with one metadata bump',()=>{
  const expected=get(previous,'social_schedule_revoke',true)
   .replace('calendar_social_source_lock_probe(p_principal,p_input)',
    'calendar_source_gate_begin_probe(project)');
  const actual=get(signed,'social_schedule_revoke',true);
  expect(actual).toBe(expected);
  expect(actual).toContain('calendar_social_source_bump_probe(p_principal,p_input)');
  expect(actual).toContain("perform public.social_schedule_cancel_jobs(");
 });
 it('cancel_jobs retains provider uncertain and terminal checks but signs before row locking',()=>{
  const old=get(migration,'social_schedule_cancel_jobs',false);
  const actual=get(signed,'social_schedule_cancel_jobs',true)
   .replace('create or replace function','create function')
   .replace('\n guard_project uuid;','')
   .replace(
    " -- Helper may also be called directly by service_role. Resolve the approval\n"+
    " -- project WITHOUT row locks before acquiring its signed source gate.\n"+
    " select d.project_id into guard_project from public.social_schedule_decisions d\n"+
    " where d.id=p_approval and d.action='approve';\n"+
    " if guard_project is null then return;end if;\n"+
    " perform public.calendar_source_gate_begin_probe(guard_project);\n",'');
  expect(actual).toBe(old);
  expect(actual).toContain("when r.state in ('creating','publishing','uncertain')");
  const candidate=get(signed,'social_schedule_cancel_jobs',true);
  expect(candidate.indexOf('calendar_source_gate_begin_probe(guard_project)')).toBeLessThan(
   candidate.indexOf('from public.social_schedule_jobs where approval_id=p_approval'));
 });
 it('protected job rows use trigger-based source counts, never a duplicate manual bump',()=>{
  expect(signed).toContain('calendar_source_gate_begin_probe');
  expect(gate).toContain('create trigger calendar_gate_jobs_after_probe');
  const approval=get(signed,'social_schedule_approve',true);
  expect(approval).not.toContain('calendar_social_source_bump_probe');
  // Additional metadata changes in propose/revoke remain explicit because
  // the fixture does not trigger on batches/decisions.
  for(const name of ['social_schedule_propose','social_schedule_revoke']){
   const code=get(signed,name,true);
   expect((code.match(/calendar_social_source_bump_probe/g)??[]).length).toBe(1);
  }
 });
});
