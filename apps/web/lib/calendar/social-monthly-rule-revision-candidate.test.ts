import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const principal=(user=USER_A,projects=[PROJECT_A])=>({userId:user,allowedProjectIds:projects});
const rule=(enabled:boolean,localTime='20:30')=>({
 dayOfMonth:1,localTime,timeZone:'Europe/Stockholm',channels:['facebook','instagram'],enabled
});
const request=(enabled:boolean,user=USER_A,localTime='20:30',projects=[PROJECT_A])=>
 "select public.social_schedule_monthly_rule_save('"+
 JSON.stringify(principal(user,projects)).replaceAll("'","''")+"'::jsonb,'"+
 JSON.stringify({projectId:PROJECT_A,rule:rule(enabled,localTime)}).replaceAll("'","''")+"'::jsonb);";
const run=(enabled:boolean)=>f.sql('set local role service_role;'+request(enabled));
const version=()=>f.sql("select revision from public.calendar_source_revision_probe where owner_user_id='"+USER_A+"' and project_id='"+PROJECT_A+"'");
const savedRule=()=>f.sql("select rule->>'enabled' from public.social_monthly_release_rules where project_id='"+PROJECT_A+"'");
const events=()=>f.sql("select count(*) from public.social_schedule_events where project_id='"+PROJECT_A+"'");

beforeAll(()=>{
 f=initializeCalendarDb();
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/social-monthly-source-fixture.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/social-monthly-rule-revision-candidate.sql'),'utf8'));
},60000);
afterAll(()=>f?.close(),60000);

describe('real-shaped monthly social rule with source revision lock',()=>{
 it('limits all social write RPCs to service_role, not authenticated clients',()=>{
  for(const signature of [
   'social_schedule_monthly_rule_save(jsonb,jsonb)',
   'calendar_social_source_lock_probe(jsonb,jsonb)',
   'calendar_social_source_bump_probe(jsonb,jsonb)'
  ]){
   expect(f.sql("select has_function_privilege('authenticated','public."+signature+"','EXECUTE')")).toBe('f');
   expect(f.sql("select has_function_privilege('service_role','public."+signature+"','EXECUTE')")).toBe('t');
  }
  expect(()=>f.sql(request(true),USER_A)).toThrow(/permission denied/i);
 });
 it('fails closed when calendar source revision row is missing',()=>{
  expect(()=>run(true)).toThrow(/MISSING_SOURCE_REVISION/);
  expect(savedRule()).toBe('');
  expect(events()).toBe('0');
 });
 it('saves the actual rule plus its event and revision in one transaction',()=>{
  f.sql("insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+USER_A+"','"+PROJECT_A+"',1),('"+USER_B+"','"+PROJECT_B+"',1)");
  expect(JSON.parse(run(true))).toMatchObject({enabled:true,localTime:'20:30'});
  expect(version()).toBe('2');expect(savedRule()).toBe('true');expect(events()).toBe('1');
  expect(JSON.parse(run(false))).toMatchObject({enabled:false});
  expect(version()).toBe('3');expect(savedRule()).toBe('false');expect(events()).toBe('2');
  expect(f.sql("select revision from public.calendar_source_revision_probe where owner_user_id='"+USER_B+"' and project_id='"+PROJECT_B+"'")).toBe('1');
  expect(f.sql("select string_agg(event,',' order by id) from public.social_schedule_events")).toBe('monthly_rule_saved,monthly_rule_saved');
 });
 it('rejects a foreign or out-of-scope principal',()=>{
  expect(()=>f.sql('set local role service_role;'+request(true,USER_B))).toThrow(/SOCIAL_LAUNCH_NOT_FOUND/);
  expect(()=>f.sql('set local role service_role;'+request(true,USER_A,'20:30',[]))).toThrow(/SOCIAL_LAUNCH_NOT_FOUND/);
  expect(version()).toBe('3');expect(events()).toBe('2');
 });
 it('rejects an invalid rule without bumping the source',()=>{
  expect(()=>f.sql('set local role service_role;'+request(true,USER_A,'19:00'))).toThrow(/SOCIAL_SCHEDULE_INVALID_BODY/);
  expect(version()).toBe('3');expect(events()).toBe('2');
 });
 it('rolls back monthly rule, audit event and source revision on late failure',()=>{
  expect(()=>f.sql('set local role service_role;'+request(true)+'select 1/0;')).toThrow();
  expect(version()).toBe('3');expect(savedRule()).toBe('false');expect(events()).toBe('2');
 });
});
