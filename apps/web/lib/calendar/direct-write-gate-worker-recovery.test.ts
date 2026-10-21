import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const q=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const json=(value:unknown)=>q(JSON.stringify(value))+'::jsonb';
const sql=(name:string,...args:unknown[])=>'select public.'+name+'('+
 args.map(json).join(',')+');';
const service=(name:string,...args:unknown[])=>JSON.parse(f.sql('set local role service_role;'+sql(name,...args)));
const revision=()=>f.sql("select revision from public.calendar_source_revision_probe where owner_user_id="+q(USER_A)+" and project_id="+q(PROJECT_A));
const count=(table:string)=>Number(f.sql('select count(*) from public.'+table));
const jobState=(id:string)=>f.sql('select state from public.social_schedule_jobs where id='+q(id));
const jobVersion=(id:string)=>Number(f.sql('select version from public.social_schedule_jobs where id='+q(id)));
const pubState=(id:string)=>f.sql('select state from public.social_publications where id='+q(id));
const pubVersion=(id:string)=>Number(f.sql('select version from public.social_publications where id='+q(id)));
type Fixture={jobId:string;postId:string;claimId:string;publicationId:string|null;claim:(version:number)=>{jobId:string;claimId:string;version:number}};
function seed(publicationState?:string,jobStateName='claimed'):Fixture{
 const jobId=randomUUID(),postId=randomUUID(),revId=randomUUID(),batchId=randomUUID(),
  approvalId=randomUUID(),claimId=randomUUID(),occasionId=randomUUID(),publicationId=publicationState?randomUUID():null;
 const start=new Date(Date.now()-12_000).toISOString(),
  end=new Date(Date.parse(start)+600_000).toISOString();
 f.sql('insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
  [USER_A,PROJECT_A].map(q).join(',')+',1)');
 f.sql('alter table public.social_publications disable trigger user;'+
  'alter table public.social_schedule_jobs disable trigger user;'+
  'insert into public.social_content_revisions(id,post_id,project_id,sha256) values('+
  [revId,postId,PROJECT_A,'a'.repeat(64)].map(q).join(',')+');'+
  'insert into public.social_schedule_batches(id,batch_id,project_id,sequence,manifest,sha256,created_by,idempotency_key,input_data) values('+
  [batchId,randomUUID(),PROJECT_A].map(q).join(',')+",1,'{}'::jsonb,"+q('a'.repeat(64))+','+
  q(USER_A)+','+q('proposal-'+batchId.replaceAll('-',''))+",'{}'::jsonb);"+
  'insert into public.social_schedule_decisions(id,project_id,batch_revision_id,action,actor,idempotency_key,input_data) values('+
  [approvalId,PROJECT_A,batchId,'approve',USER_A,'approval-'+approvalId.replaceAll('-','')].map(q).join(',')+",'{}'::jsonb);");
 if(publicationId){
  f.sql('insert into public.social_publications(id,project_id,post_id,state,job_id,channel,version) values('+
   [publicationId,PROJECT_A,postId,publicationState!].map(q).join(',')+','+
   q(jobId)+","+q('facebook')+",1)");
 }
 const item={decisionId:approvalId,bindingId:randomUUID(),accountId:'12345',releaseCondition:null};
 f.sql('insert into public.social_schedule_jobs(id,project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,state,claim_id,worker_id,lease_expires_at,publication_id) values('+
  [jobId,PROJECT_A,batchId,approvalId,postId,revId,'a'.repeat(64),'facebook',occasionId,start,end].map(q).join(',')+
  ','+json(item)+','+q(jobStateName)+','+q(claimId)+','+q('atlas-worker')+
  ",now()+interval '90 seconds',"+(publicationId?q(publicationId):'null')+');'+
  'alter table public.social_publications enable trigger user;'+
  'alter table public.social_schedule_jobs enable trigger user;');
 return {jobId,postId,claimId,publicationId,claim:(version:number)=>({jobId,claimId,version})};
}

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of ['source-revision-probe.sql','social-review-source-fixture.sql',
  'social-worker-claim-source-fixture.sql','social-worker-step-recovery-fixture.sql',
  'direct-write-gate-probe.sql',
  'direct-write-gate-worker-recovery-integration-probe.sql']){
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 }
},60000);
beforeEach(()=>{
 // Seed/reset happens as owner in a disposable DB. Do not run these commands
 // on any live database: production writes must pass the signed source gate.
 f.sql('alter table public.social_publications disable trigger user;'+
  'alter table public.social_schedule_jobs disable trigger user;'+
  'delete from public.social_publication_events;'+
  'delete from public.social_schedule_events;delete from public.social_schedule_jobs;'+
  'delete from public.social_schedule_decisions;delete from public.social_schedule_batches;'+
  'delete from public.social_publications;delete from public.social_content_revisions;'+
  'delete from public.calendar_source_revision_probe;'+
  'alter table public.social_publications enable trigger user;'+
  'alter table public.social_schedule_jobs enable trigger user;');
},60000);
afterAll(()=>f?.close(),60000);

describe('signed source guard + triggered social step and checkpoint recovery',()=>{
 it('keeps worker-only entry points and revision helper private',()=>{
  for(const signature of ['social_schedule_locked_claim(jsonb)',
   'social_schedule_step(jsonb,jsonb)','social_schedule_recover_checkpoint(jsonb)',
   'calendar_source_gate_begin_probe(uuid)']){
   expect(f.sql("select has_function_privilege('authenticated','public."+signature+"','EXECUTE')")).toBe('f');
   expect(f.sql("select has_function_privilege('service_role','public."+signature+"','EXECUTE')")).toBe('t');
  }
  expect(()=>f.sql(sql('social_schedule_recover_checkpoint',{jobId:randomUUID(),claimId:randomUUID(),version:1}),USER_A)).toThrow(/permission denied/i);
 });
 it('fails closed on a missing project source revision before writing a publication',()=>{
  const fx=seed();
  f.sql('delete from public.calendar_source_revision_probe');
  expect(()=>service('social_schedule_step',fx.claim(1),{action:'prepare'})).toThrow(/MISSING_SOURCE_REVISION/);
  expect(count('social_publications')).toBe(0);expect(count('social_schedule_events')).toBe(0);
  expect(jobVersion(fx.jobId)).toBe(1);
 });
 it('prepares a publication once and moves the worker job and calendar revision atomically',()=>{
  const fx=seed();
  const receipt=service('social_schedule_step',fx.claim(1),{action:'prepare'});
  expect(receipt.jobState).toBe('claimed');expect(receipt.publication.state).toBe('requested');
  expect(count('social_publications')).toBe(1);expect(count('social_publication_events')).toBe(1);
  expect(jobVersion(fx.jobId)).toBe(2);expect(revision()).toBe('3');
  expect(()=>service('social_schedule_step',fx.claim(1),{action:'prepare'})).toThrow(/SOCIAL_SCHEDULE_CONFLICT/);
  expect(count('social_publications')).toBe(1);expect(revision()).toBe('3');
 });
 it('keeps an unchanged provider version a read-only receipt without a bump',()=>{
  const fx=seed();
  service('social_schedule_step',fx.claim(1),{action:'prepare'});
  const reply=service('social_schedule_step',fx.claim(2),{action:'claim_create',expectedVersion:99});
  expect(reply.jobState).toBe('claimed');
  expect(pubVersion(reply.publication.id)).toBe(1);
  expect(count('social_publication_events')).toBe(1);
  expect(jobVersion(fx.jobId)).toBe(2);expect(revision()).toBe('3');
 });
 it('treats interrupted Facebook publishing as uncertain rather than a second provider call',()=>{
  const fx=seed();
  const prepared=service('social_schedule_step',fx.claim(1),{action:'prepare'});
  service('social_schedule_step',fx.claim(2),{
   action:'claim_create',expectedVersion:1,capabilityHash:'c'.repeat(64)
  });
  expect(pubState(prepared.publication.id)).toBe('publishing');
  expect(revision()).toBe('5');
  const checkpoint=service('social_schedule_step',fx.claim(3),{action:'checkpoint',reason:'stopped'});
  expect(checkpoint.jobState).toBe('uncertain');
  expect(pubState(prepared.publication.id)).toBe('uncertain');
  expect(f.sql('select failure_code from public.social_publications where id='+q(prepared.publication.id))).toBe('receipt_unavailable');
  expect(revision()).toBe('7');
  expect(count('social_publications')).toBe(1);
  expect(()=>service('social_schedule_step',fx.claim(3),{action:'checkpoint'})).toThrow(/SOCIAL_SCHEDULE_CONFLICT/);
  expect(revision()).toBe('7');
 });
 it('accepts a caller-supplied provider receipt on an approved claimed job',()=>{
  // The test retains the real claim ID, lease, job version and approval chain.
  // There is no provider client in this disposable SQL fixture.
  const fx=seed();
  const prepared=service('social_schedule_step',fx.claim(1),{action:'prepare'});
  service('social_schedule_step',fx.claim(2),{
   action:'claim_create',expectedVersion:1,capabilityHash:'c'.repeat(64)
  });
  const receipt=service('social_schedule_step',fx.claim(3),{
   action:'complete',expectedVersion:2,providerId:'12345_99999',
   permalink:'https://www.facebook.com/12345/posts/99999'
  });
  expect(receipt.jobState).toBe('published');
  expect(pubState(prepared.publication.id)).toBe('published');
  expect(f.sql('select provider_id from public.social_publications where id='+q(prepared.publication.id)))
   .toBe('12345_99999');
  expect(count('social_publication_events')).toBe(3);
 });
 it('isolates a scheduled publisher for a valid claim and rolls the candidate back',()=>{
  const fx=seed();
  const prepared=service('social_schedule_step',fx.claim(1),{action:'prepare'});
  service('social_schedule_step',fx.claim(2),{
   action:'claim_create',expectedVersion:1,capabilityHash:'c'.repeat(64)
  });
  const before=revision();
  const complete={action:'complete',expectedVersion:2,providerId:'12345_99999',
   permalink:'https://www.facebook.com/12345/posts/99999'};
  const denied='do $probe$ begin '+
   sql('social_schedule_step',fx.claim(3),complete).replace(/^select /,'perform ')+
   "raise exception 'UNEXPECTED_STEP_ALLOWED';"+
   'exception when insufficient_privilege then null; end $probe$;';
  const out=f.sql('savepoint scheduled_role_probe;'+
   readFileSync(resolve(process.cwd(),
    'lib/calendar/direct-write-gate-scheduled-publisher-role-candidate.sql'),'utf8')+
   "select has_table_privilege('service_role','public.social_publications','UPDATE')::text||"+
   "has_table_privilege('service_role','public.social_schedule_jobs','UPDATE')::text||"+
   "has_function_privilege('service_role','public.social_schedule_step(jsonb,jsonb)','EXECUTE')::text;"+
   'set local role service_role;'+denied+
   'set local role social_schedule_publisher_fixture;'+
   sql('social_schedule_step',fx.claim(3),complete)+
   'rollback to savepoint scheduled_role_probe;').split('\n');
  expect(out[0]).toBe('falsefalsefalse');
  const receipt=JSON.parse(out.at(-1)!);
  expect(receipt.jobState).toBe('published');
  expect(receipt.publication.providerId).toBe('12345_99999');
  expect(jobState(fx.jobId)).toBe('claimed');
  expect(jobVersion(fx.jobId)).toBe(3);
  expect(pubState(prepared.publication.id)).toBe('publishing');
  expect(pubVersion(prepared.publication.id)).toBe(2);
  expect(revision()).toBe(before);
  expect(f.sql("select to_regrole('social_schedule_publisher_fixture') is null")).toBe('t');
 });
 it('recovers an in-flight publishing receipt as uncertain without any provider retry',()=>{
  const fx=seed('publishing');
  const receipt=service('social_schedule_recover_checkpoint',fx.claim(1));
  expect(receipt.jobState).toBe('uncertain');
  expect(jobVersion(fx.jobId)).toBe(2);
  expect(pubState(fx.publicationId!)).toBe('uncertain');
  expect(count('social_publications')).toBe(1);
  expect(count('social_schedule_events')).toBe(1);
  expect(count('social_publication_events')).toBe(1);
  expect(revision()).toBe('3');
  const repeat=service('social_schedule_recover_checkpoint',fx.claim(2));
  expect(repeat.jobState).toBe('uncertain');
  expect(jobVersion(fx.jobId)).toBe(2);expect(revision()).toBe('3');
 });
 it('rejects privileged direct job status changes after the signed RPC has committed',()=>{
  const fx=seed();
  service('social_schedule_step',fx.claim(1),{action:'prepare'});
  expect(()=>f.sql('set local role service_role;'+
   "update public.social_schedule_jobs set state='published' where id="+q(fx.jobId)))
   .toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(jobState(fx.jobId)).toBe('claimed');
  expect(revision()).toBe('3');
 });
 it('recovers a never-dispatched claim to waiting with exactly one job-row version bump',()=>{
  const fx=seed();
  const receipt=service('social_schedule_recover_checkpoint',fx.claim(1));
  expect(receipt.jobState).toBe('waiting');
  expect(jobState(fx.jobId)).toBe('waiting');
  expect(count('social_publications')).toBe(0);
  expect(count('social_publication_events')).toBe(0);
  expect(count('social_schedule_events')).toBe(1);
  expect(jobVersion(fx.jobId)).toBe(2);
  expect(revision()).toBe('2');
 });
 it('does not mutate completed recovery history or bump a source version',()=>{
  const fx=seed('published','published');
  const receipt=service('social_schedule_recover_checkpoint',fx.claim(1));
  expect(receipt.jobState).toBe('published');
  expect(count('social_schedule_events')).toBe(0);expect(revision()).toBe('1');
 });
 it('stale or forged claim identifiers cannot update a source revision',()=>{
  const fx=seed('creating');
  expect(()=>service('social_schedule_recover_checkpoint',{...fx.claim(1),claimId:randomUUID()}))
   .toThrow(/SOCIAL_SCHEDULE_CONFLICT/);
  expect(()=>service('social_schedule_step',{...fx.claim(1),claimId:randomUUID()},{action:'checkpoint'}))
   .toThrow(/SOCIAL_SCHEDULE_CONFLICT/);
  expect(jobState(fx.jobId)).toBe('claimed');expect(revision()).toBe('1');
 });
 it('a late failure restores status, audit and source version in the same SQL transaction',()=>{
  const fx=seed('creating');
  expect(()=>f.sql('set local role service_role;'+sql('social_schedule_recover_checkpoint',fx.claim(1))+
   'select 1/0;')).toThrow();
  expect(jobState(fx.jobId)).toBe('claimed');expect(pubState(fx.publicationId!)).toBe('creating');
  expect(jobVersion(fx.jobId)).toBe(1);expect(count('social_schedule_events')).toBe(0);
  expect(count('social_publication_events')).toBe(0);expect(revision()).toBe('1');
 });
});
