import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const manifestHash='a'.repeat(64);
const principal=(user=USER_A,allowed=[PROJECT_A])=>({userId:user,allowedProjectIds:allowed});
const input=(overrides:Record<string,unknown>={})=>({
 projectId:PROJECT_A,releaseMonth:'2026-12',catalogSha256:manifestHash,
 customerViewUrl:'https://familje-stunden.se/december',
 confirmed:true,...overrides
});
const quote=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const rpc=(data=input(),actor=principal())=>
 'select public.social_schedule_release_confirm('+quote(actor)+','+quote(data)+');';
const confirm=(data=input(),actor=principal())=>JSON.parse(f.sql('set local role service_role;'+rpc(data,actor)));
const source=(user=USER_A,project=PROJECT_A)=>f.sql(
 "select revision from public.calendar_source_revision_probe where owner_user_id='"+
 user+"' and project_id='"+project+"'");
const evidence=()=>Number(f.sql('select count(*) from public.social_monthly_release_evidence'));
const events=()=>Number(f.sql('select count(*) from public.social_schedule_events'));

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of ['source-revision-probe.sql','social-monthly-source-fixture.sql',
  'social-release-confirm-source-fixture.sql'])
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 const helpers=readFileSync(resolve(process.cwd(),
  'lib/calendar/social-monthly-rule-revision-candidate.sql'),'utf8');
 f.sql(helpers.split('create or replace function public.social_schedule_monthly_rule_save(')[0]);
 f.sql(readFileSync(resolve(process.cwd(),
  'lib/calendar/social-release-confirm-revision-candidate.sql'),'utf8'));
},60000);
beforeEach(()=>{
 f.sql('delete from public.social_monthly_release_evidence;'+
  'delete from public.social_schedule_events;delete from public.calendar_source_revision_probe;');
},60000);
afterAll(()=>f?.close(),60000);

describe('reviewed monthly content release evidence source revisions',()=>{
 it('retains service-only monthly confirmation and source version helper grants',()=>{
  for(const signature of [
   'social_schedule_release_confirm(jsonb,jsonb)',
   'calendar_social_source_lock_probe(jsonb,jsonb)',
   'calendar_social_source_bump_probe(jsonb,jsonb)'
  ]){
   expect(f.sql("select has_function_privilege('authenticated','public."+signature+"','EXECUTE')"))
    .toBe('f');
   expect(f.sql("select has_function_privilege('service_role','public."+signature+"','EXECUTE')"))
    .toBe('t');
  }
  expect(()=>f.sql(rpc(),USER_A)).toThrow(/permission denied/);
 });
 it('rejects absent source version before inserting monthly release evidence',()=>{
  expect(()=>confirm()).toThrow(/MISSING_SOURCE_REVISION/);
  expect(evidence()).toBe(0);expect(events()).toBe(0);
 });
 it('commits one evidence row, audit and source increment in one transaction',()=>{
  f.sql("insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+
   USER_A+"','"+PROJECT_A+"',1),('"+USER_B+"','"+PROJECT_B+"',7)");
  const result=confirm();
  expect(result.releaseMonth).toBe('2026-12');
  expect(result.kind).toBe('owner_verified_access');
  expect(result.catalogSha256).toBe(manifestHash);
  expect(evidence()).toBe(1);expect(events()).toBe(1);expect(source()).toBe('2');
  expect(source(USER_B,PROJECT_B)).toBe('7');
  expect(f.sql('select event from public.social_schedule_events')).toBe('release_access_confirmed');
  expect(f.sql('select customer_view_url from public.social_monthly_release_evidence'))
   .toBe('https://familje-stunden.se/december');
 });
 it('preserves the original append-only semantics: a repeated confirmation is a new event',()=>{
  f.sql("insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+
   USER_A+"','"+PROJECT_A+"',1)");
  const first=confirm(),second=confirm();
  expect(first.id).not.toBe(second.id);
  expect(evidence()).toBe(2);expect(events()).toBe(2);expect(source()).toBe('3');
 });
 it('rejects wrong owner or missing allowedProjectIds without changing evidence',()=>{
  f.sql("insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+
   USER_A+"','"+PROJECT_A+"',1)");
  expect(()=>confirm(input(),principal(USER_B,[PROJECT_A]))).toThrow(/SOCIAL_LAUNCH_NOT_FOUND/);
  expect(()=>confirm(input(),principal(USER_A,[]))).toThrow(/SOCIAL_LAUNCH_NOT_FOUND/);
  expect(source()).toBe('1');expect(evidence()).toBe(0);
 });
 it('rejects malformed, unconfirmed or unsafe release input before version bump',()=>{
  f.sql("insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+
   USER_A+"','"+PROJECT_A+"',1)");
  for(const bad of [
   {confirmed:false},{customerViewUrl:'http://example.com/december'},
   {customerViewUrl:'https://example.com/december?private=1'},
   {catalogSha256:'not-a-valid-sha'},
   {releaseMonth:'2026-13'}
  ]){
   expect(()=>confirm(input(bad))).toThrow(/SOCIAL_SCHEDULE_INVALID_BODY/);
  }
  expect(source()).toBe('1');expect(evidence()).toBe(0);expect(events()).toBe(0);
 });
 it('rolls back evidence, audit and source version after a late SQL failure',()=>{
  f.sql("insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+
   USER_A+"','"+PROJECT_A+"',1)");
  expect(()=>f.sql('set local role service_role;'+rpc()+'select 1/0;')).toThrow();
  expect(source()).toBe('1');expect(evidence()).toBe(0);expect(events()).toBe(0);
 });
});
