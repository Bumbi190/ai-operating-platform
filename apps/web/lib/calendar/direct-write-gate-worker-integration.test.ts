import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
type Job={id:string;project:string;owner:string;post:string;revision:string;batch:string;approval:string};
const q=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const ago=(seconds:number)=>new Date(Date.now()-seconds*1000).toISOString();
const call=(ids:string[],dryRun=false)=>{
 const input={workerId:'atlas-worker-test',now:new Date().toISOString(),dryRun,projectIds:ids};
 return "select public.social_schedule_claim('"+JSON.stringify(input)+"'::jsonb);";
};
const claim=(ids:string[],dryRun=false)=>f.sql('set local role service_role;'+call(ids,dryRun));
const revision=(user:string,project:string)=>f.sql(
 'select revision from public.calendar_source_revision_probe where owner_user_id='+q(user)+
 ' and project_id='+q(project));
const jobState=(id:string)=>f.sql('select state from public.social_schedule_jobs where id='+q(id));
const countEvents=(event:string)=>Number(f.sql(
 'select count(*) from public.social_schedule_events where event='+q(event)));
const bumpSeed=(owner:string,project:string,value=1)=>f.sql(
 'insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
 q(owner)+','+q(project)+','+value+')');

function seed(owner=USER_A,project=PROJECT_A,elapsedSeconds=15):Job{
 const job:Job={id:randomUUID(),project,owner,post:randomUUID(),
  revision:randomUUID(),batch:randomUUID(),approval:randomUUID()};
 const batchId=randomUUID(),occasion=randomUUID();
 const scheduled=ago(elapsedSeconds),expires=new Date(Date.parse(scheduled)+600000).toISOString();
 f.sql('alter table public.social_publications disable trigger user;'+
  'alter table public.social_schedule_jobs disable trigger user;'+
  'insert into public.social_content_revisions(id,post_id,project_id,sha256) values('+
  [job.revision,job.post,project,'a'.repeat(64)].map(q).join(',')+');'+
  'insert into public.social_schedule_batches(id,batch_id,project_id,sequence,manifest,sha256,created_by,idempotency_key,input_data) values('+
  [job.batch,batchId,project].map(q).join(',')+",1,'{}'::jsonb,"+q('a'.repeat(64))+','+
  q(owner)+','+q('p-'+job.batch.replaceAll('-',''))+",'{}'::jsonb);"+
  'insert into public.social_schedule_decisions(id,project_id,batch_revision_id,action,actor,idempotency_key,input_data) values('+
  [job.approval,project,job.batch,'approve',owner,'a-'+job.batch.replaceAll('-','')].map(q).join(',')+",'{}'::jsonb);"+
  'insert into public.social_schedule_jobs(id,project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item) values('+
  [job.id,project,job.batch,job.approval,job.post,job.revision,'a'.repeat(64),'facebook',occasion,scheduled,expires].map(q).join(',')+
  ",'{\"releaseCondition\":null}'::jsonb);"+
  'alter table public.social_publications enable trigger user;'+
  'alter table public.social_schedule_jobs enable trigger user;');
 return job;
}
beforeAll(()=>{
 f=initializeCalendarDb();
 for(const name of ['source-revision-probe.sql','social-review-source-fixture.sql',
  'social-worker-claim-source-fixture.sql','direct-write-gate-probe.sql',
  'direct-write-gate-worker-integration-probe.sql'])
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+name),'utf8'));
},60000);
beforeEach(()=>{
 f.sql('alter table public.social_publications disable trigger user;'+
  'alter table public.social_schedule_jobs disable trigger user;'+
  'delete from public.social_publication_events;'+
  'delete from public.social_schedule_events;'+
  'delete from public.social_schedule_jobs;'+
  'delete from public.social_schedule_decisions;'+
  'delete from public.social_schedule_batches;'+
  'delete from public.social_publications;'+
  'delete from public.social_content_revisions;'+
  'delete from public.calendar_source_revision_probe;'+
  'alter table public.social_publications enable trigger user;'+
  'alter table public.social_schedule_jobs enable trigger user;');
},60000);
afterAll(()=>f?.close(),60000);

describe('real social worker claim + signed per-transaction trigger integration',()=>{
 it('protects the worker-only function and both revision helpers',()=>{
  for(const sig of ['social_schedule_claim(jsonb)',
   'calendar_source_gate_try_begin_probe(uuid)',
   'calendar_source_gate_begin_probe(uuid)']){
   expect(f.sql("select has_function_privilege('authenticated','public."+sig+"','EXECUTE')")).toBe('f');
   expect(f.sql("select has_function_privilege('service_role','public."+sig+"','EXECUTE')")).toBe('t');
  }
  expect(()=>f.sql(call([PROJECT_A]),USER_A)).toThrow(/permission denied/i);
 });
 it('dryRun does not mutate a job or source revision',()=>{
  bumpSeed(USER_A,PROJECT_A);
  const a=seed();
  expect(claim([PROJECT_A],true)).toBe('');
  expect(jobState(a.id)).toBe('queued');
  expect(revision(USER_A,PROJECT_A)).toBe('1');
  expect(countEvents('claimed')).toBe(0);
 });
 it('rejects an untracked source revision without changing the job',()=>{
  const a=seed();
  expect(()=>claim([PROJECT_A])).toThrow(/MISSING_SOURCE_REVISION/);
  expect(jobState(a.id)).toBe('queued');
  expect(countEvents('claimed')).toBe(0);
 });
 it('creates one claim, bump and audit without dispatching any provider call',()=>{
  bumpSeed(USER_A,PROJECT_A);
  const a=seed();
  const result=JSON.parse(claim([PROJECT_A]));
  expect(result.jobId).toBe(a.id);
  expect(jobState(a.id)).toBe('claimed');
  expect(revision(USER_A,PROJECT_A)).toBe('2');
  expect(countEvents('claimed')).toBe(1);
  expect(claim([PROJECT_A])).toBe('');
  expect(revision(USER_A,PROJECT_A)).toBe('2');
  expect(countEvents('claimed')).toBe(1);
 });
 it('marks expired work missed, bumps once and does not create a provider publication',()=>{
  bumpSeed(USER_A,PROJECT_A);
  const a=seed(USER_A,PROJECT_A,3600);
  expect(claim([PROJECT_A])).toBe('');
  expect(jobState(a.id)).toBe('missed');
  expect(revision(USER_A,PROJECT_A)).toBe('2');
  expect(countEvents('missed')).toBe(1);
  expect(f.sql('select count(*) from public.social_publications')).toBe('0');
 });
 it('blocks a revoked approval before attempting a provider action',()=>{
  bumpSeed(USER_A,PROJECT_A);
  const a=seed();
  const revocation=randomUUID();
  f.sql('insert into public.social_schedule_decisions(id,project_id,batch_revision_id,action,actor,approval_id,reason,idempotency_key,input_data) values('+
   [revocation,PROJECT_A,a.batch,'revoke',USER_A,a.approval,'owner_revoked','revoke-'+revocation].map(q).join(',')+",'{}'::jsonb)");
  expect(claim([PROJECT_A])).toBe('');
  expect(jobState(a.id)).toBe('blocked');
  expect(revision(USER_A,PROJECT_A)).toBe('2');
  expect(countEvents('blocked')).toBe(1);
 });
 it('marks expired in-flight provider claims uncertain rather than retrying a provider POST',()=>{
  bumpSeed(USER_A,PROJECT_A);
  const a=seed();
  const pub=randomUUID(),claimId=randomUUID();
  f.sql('alter table public.social_publications disable trigger user;'+
   'alter table public.social_schedule_jobs disable trigger user;'+
   'insert into public.social_publications(id,project_id,post_id,state) values('+
   [pub,PROJECT_A,a.post,'creating'].map(q).join(',')+');'+
   'update public.social_schedule_jobs set state='+q('claimed')+',publication_id='+q(pub)+
   ',claim_id='+q(claimId)+',lease_expires_at=now()-interval \'1 minute\' where id='+q(a.id)+';'+
   'alter table public.social_publications enable trigger user;'+
   'alter table public.social_schedule_jobs enable trigger user;');
  expect(claim([PROJECT_A])).toBe('');
  expect(jobState(a.id)).toBe('uncertain');
  expect(f.sql('select state from public.social_publications where id='+q(pub))).toBe('uncertain');
  // Both a publication row AND a job row changed; AFTER triggers bump twice.
  expect(revision(USER_A,PROJECT_A)).toBe('3');
  expect(countEvents('lease_recovered')).toBe(1);
  expect(f.sql('select count(*) from public.social_publication_events where publication_id='+q(pub))).toBe('1');
 });
 it('rejects a direct service_role worker UPDATE after a signed RPC COMMIT',()=>{
  bumpSeed(USER_A,PROJECT_A);
  const a=seed();
  expect(JSON.parse(claim([PROJECT_A])).jobId).toBe(a.id);
  expect(()=>f.sql('set local role service_role;'+
   "update public.social_schedule_jobs set state='blocked' where id="+q(a.id)))
   .toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(jobState(a.id)).toBe('claimed');
  expect(revision(USER_A,PROJECT_A)).toBe('2');
 });
 it('preserves revision isolation between distinct projects',()=>{
  bumpSeed(USER_A,PROJECT_A);bumpSeed(USER_B,PROJECT_B,7);
  const a=seed(),b=seed(USER_B,PROJECT_B);
  expect(JSON.parse(claim([PROJECT_B])).jobId).toBe(b.id);
  expect(jobState(a.id)).toBe('queued');
  expect(revision(USER_A,PROJECT_A)).toBe('1');
  expect(revision(USER_B,PROJECT_B)).toBe('8');
 });
});
