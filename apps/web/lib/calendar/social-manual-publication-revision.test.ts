import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const post=randomUUID(),rev=randomUUID(),binding=randomUUID(),decision=randomUUID();
const sha='a'.repeat(64),capability='c'.repeat(64);
const actor=(user=USER_A,projects=[PROJECT_A])=>({userId:user,allowedProjectIds:projects});
const prepare=(extra:Record<string,unknown>={})=>({
 projectId:PROJECT_A,postId:post,revisionId:rev,sha256:sha,
 decisionId:decision,bindingId:binding,idempotencyKey:'manual-first',
 confirmed:true,...extra
});
const step=(publicationId:string,action:string,expectedVersion:number,extra:Record<string,unknown>={})=>({
 projectId:PROJECT_A,postId:post,publicationId,action,expectedVersion,...extra
});
const quote=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const statement=(name:'prepare'|'step',input:unknown,principal=actor())=>
 'select public.social_publication_'+name+'('+quote(principal)+','+quote(input)+');';
const run=(name:'prepare'|'step',input:unknown,principal=actor())=>
 JSON.parse(f.sql('set local role service_role;'+statement(name,input,principal)));
const revision=(owner=USER_A,project=PROJECT_A)=>f.sql(
 "select revision from public.calendar_source_revision_probe where owner_user_id='"+
 owner+"' and project_id='"+project+"'");
const n=(table:string)=>Number(f.sql('select count(*) from public.'+table));
const state=(id:string)=>f.sql("select state from public.social_publications where id='"+id+"'");
const version=(id:string)=>Number(f.sql("select version from public.social_publications where id='"+id+"'"));
const initSource=()=>f.sql(
 "insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+
 USER_A+"','"+PROJECT_A+"',1),('"+USER_B+"','"+PROJECT_B+"',7)");
const create=()=>run('prepare',prepare()) as {id:string;state:string;version:number;authoritySource:string};

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of ['source-revision-probe.sql','social-review-source-fixture.sql',
  'social-manual-publication-source-fixture.sql']){
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 }
 const helper=readFileSync(resolve(process.cwd(),
  'lib/calendar/social-monthly-rule-revision-candidate.sql'),'utf8');
 f.sql(helper.split('create or replace function public.social_schedule_monthly_rule_save(')[0]);
 f.sql(readFileSync(resolve(process.cwd(),
  'lib/calendar/social-manual-publication-revision-candidate.sql'),'utf8'));
 f.sql("insert into public.social_content_posts(id,project_id) values('"+post+"','"+PROJECT_A+"');"+
  "insert into public.social_content_revisions(id,post_id,project_id,sha256,binding_id,draft,binding) values('"+
  rev+"','"+post+"','"+PROJECT_A+"','"+sha+"','"+binding+
  "','{\"channel\":\"facebook\",\"format\":\"image\"}'::jsonb,'{\"accountId\":\"12345\",\"label\":\"test-account\"}'::jsonb)");
},60000);
beforeEach(()=>{
 f.sql('delete from public.social_publication_events;'+
  'delete from public.social_publications;delete from public.calendar_source_revision_probe;');
},60000);
afterAll(()=>f?.close(),60000);

describe('manual social publication prepare and step with calendar revision-first lock',()=>{
 it('restricts manual RPCs to service_role, not authenticated client callers',()=>{
  for(const name of ['prepare','step']){
   expect(f.sql("select has_function_privilege('authenticated',"+
    "'public.social_publication_"+name+"(jsonb,jsonb)','EXECUTE')")).toBe('f');
   expect(f.sql("select has_function_privilege('service_role',"+
    "'public.social_publication_"+name+"(jsonb,jsonb)','EXECUTE')")).toBe('t');
  }
  expect(()=>f.sql(statement('prepare',prepare()),USER_A)).toThrow(/permission denied/i);
 });
 it('does not prepare a publication with a missing source revision',()=>{
  expect(()=>run('prepare',prepare())).toThrow(/MISSING_SOURCE_REVISION/);
  expect(n('social_publications')).toBe(0);expect(n('social_publication_events')).toBe(0);
 });
 it('creates a manual publication once with audit and revision; replay is read-only',()=>{
  initSource();
  const first=create();
  expect(first.state).toBe('requested');
  expect(first.version).toBe(1);
  expect(first.authoritySource).toBe('manual');
  expect(n('social_publications')).toBe(1);
  expect(n('social_publication_events')).toBe(1);
  expect(revision()).toBe('2');expect(revision(USER_B,PROJECT_B)).toBe('7');
  expect(create().id).toBe(first.id);
  expect(run('prepare',prepare({idempotencyKey:'new-key'})).id).toBe(first.id);
  expect(n('social_publications')).toBe(1);
  expect(n('social_publication_events')).toBe(1);
  expect(revision()).toBe('2');
 });
 it('rejects conflicting replay and unauthorized owner/invalid request without bumps',()=>{
  initSource();
  create();
  expect(()=>run('prepare',prepare({decisionId:randomUUID()}))).toThrow(/SOCIAL_PUBLICATION_CONFLICT/);
  expect(()=>run('prepare',prepare(),actor(USER_B,[PROJECT_A]))).toThrow(/SOCIAL_LAUNCH_NOT_FOUND/);
  expect(()=>run('prepare',prepare(),actor(USER_A,[]))).toThrow(/SOCIAL_LAUNCH_NOT_FOUND/);
  expect(()=>run('prepare',prepare({confirmed:false}))).toThrow(/SOCIAL_PUBLICATION_INVALID_BODY/);
  expect(()=>run('prepare',prepare({idempotencyKey:'oops!' }))).toThrow(/SOCIAL_PUBLICATION_INVALID_BODY/);
  expect(n('social_publications')).toBe(1);expect(revision()).toBe('2');
 });
 it('rejects manually changing a publication owned by the social scheduler',()=>{
  initSource();
  const entry=create();
  f.sql("update public.social_publications set authority_source='scheduled' where id='"+entry.id+"'");
  expect(()=>run('prepare',prepare())).toThrow(/SOCIAL_PUBLICATION_REVIEW_REQUIRED/);
  expect(()=>run('step',step(entry.id,'uncertain',1,{failureCode:'receipt_unavailable'})))
   .toThrow(/SOCIAL_PUBLICATION_REVIEW_REQUIRED/);
  expect(version(entry.id)).toBe(1);expect(revision()).toBe('2');
 });
 it('manual Facebook lifecycle commits status, audit and source version together',()=>{
  initSource();
  const entry=create();
  const createClaim=run('step',step(entry.id,'claim_create',1,{capabilityHash:capability}));
  expect(createClaim.changed).toBe(true);
  expect(createClaim.record.state).toBe('publishing');
  expect(version(entry.id)).toBe(2);expect(revision()).toBe('3');
  const publish=run('step',step(entry.id,'complete',2,{
   providerId:'12345_67890',permalink:'https://www.facebook.com/posts/12345'
  }));
  expect(publish.changed).toBe(true);
  expect(publish.record.state).toBe('published');
  expect(revision()).toBe('4');
  expect(n('social_publication_events')).toBe(3);
  const again=run('step',step(entry.id,'complete',2,{providerId:'12345_67890'}));
  expect(again.changed).toBe(false);
  expect(state(entry.id)).toBe('published');expect(revision()).toBe('4');
 });
 it('returns an unchanged receipt for stale or invalid transitions without a version bump',()=>{
  initSource();
  const entry=create();
  const invalid=run('step',step(entry.id,'complete',1,{providerId:'12345_67890'}));
  expect(invalid.changed).toBe(false);
  expect(revision()).toBe('2');expect(n('social_publication_events')).toBe(1);
  const now=run('step',step(entry.id,'claim_create',1,{capabilityHash:capability}));
  expect(now.changed).toBe(true);expect(revision()).toBe('3');
  const stale=run('step',step(entry.id,'claim_create',1,{capabilityHash:capability}));
  expect(stale.changed).toBe(false);
  expect(version(entry.id)).toBe(2);expect(revision()).toBe('3');
 });
 it('rejects missing source revision before changing a prepared publication',()=>{
  initSource();
  const entry=create();
  f.sql("delete from public.calendar_source_revision_probe where project_id='"+PROJECT_A+"'");
  expect(()=>run('step',step(entry.id,'claim_create',1,{capabilityHash:capability})))
   .toThrow(/MISSING_SOURCE_REVISION/);
  expect(state(entry.id)).toBe('requested');expect(version(entry.id)).toBe(1);
  expect(n('social_publication_events')).toBe(1);
 });
 it('marks a possibly sent publication uncertain, but does not send anything again',()=>{
  initSource();
  const entry=create();
  run('step',step(entry.id,'claim_create',1,{capabilityHash:capability}));
  const uncertain=run('step',step(entry.id,'uncertain',2,{failureCode:'receipt_unavailable'}));
  expect(uncertain.changed).toBe(true);
  expect(uncertain.record.state).toBe('uncertain');
  expect(state(entry.id)).toBe('uncertain');expect(version(entry.id)).toBe(3);
  expect(revision()).toBe('4');expect(n('social_publication_events')).toBe(3);
  const noReplay=run('step',step(entry.id,'claim_create',3,{capabilityHash:capability}));
  expect(noReplay.changed).toBe(false);expect(revision()).toBe('4');
 });
 it('a late SQL fault rolls back manual publication, events and source revisions',()=>{
  initSource();
  expect(()=>f.sql('set local role service_role;'+statement('prepare',prepare())+'select 1/0;'))
   .toThrow();
  expect(n('social_publications')).toBe(0);
  expect(n('social_publication_events')).toBe(0);expect(revision()).toBe('1');
  const entry=create();
  expect(()=>f.sql('set local role service_role;'+statement('step',
   step(entry.id,'claim_create',1,{capabilityHash:capability}))+'select 1/0;'))
   .toThrow();
  expect(state(entry.id)).toBe('requested');expect(version(entry.id)).toBe(1);
  expect(n('social_publication_events')).toBe(1);expect(revision()).toBe('2');
 });
 it('fixture detects a direct service_role row-write bypass as a production blocker',()=>{
  initSource();
  const entry=create();
  f.sql("set local role service_role;update public.social_publications set state='failed'"+
   " where id='"+entry.id+"'");
  expect(state(entry.id)).toBe('failed');
  expect(revision()).toBe('2'); // Intentional proof: direct fixture writes bypass RPC.
 });
});
