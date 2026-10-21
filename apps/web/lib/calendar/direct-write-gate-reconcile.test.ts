import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const ids={post:randomUUID(),revision:randomUUID(),batch:randomUUID(),approval:randomUUID(),
 job:randomUUID(),pub:randomUUID(),proof:randomUUID(),occasion:randomUUID()};
const sha='a'.repeat(64),candidateHash='b'.repeat(64);
const providerId='12345_67890',permalink='https://www.facebook.com/12345/posts/67890';
const candidate={providerId,permalink};
const principal=(user=USER_A,projects=[PROJECT_A])=>({userId:user,allowedProjectIds:projects});
const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const json=(v:unknown)=>quote(JSON.stringify(v))+'::jsonb';
const revision=(user=USER_A,project=PROJECT_A)=>
 f.sql('select revision from public.calendar_source_revision_probe where owner_user_id='+
  quote(user)+' and project_id='+quote(project));
const state=()=>f.sql('select state from public.social_publications where id='+quote(ids.pub));
const jobState=()=>f.sql('select state from public.social_schedule_jobs where id='+quote(ids.job));
const events=(table:string)=>Number(f.sql('select count(*) from public.'+table));
const input=(v:Record<string,unknown>={})=>({
 projectId:PROJECT_A,postId:ids.post,publicationId:ids.pub,
 candidateId:ids.proof,expectedVersion:1,imageConfirmed:true,candidateHash,
 readAt:new Date().toISOString(),...v
});
const rpc=(v:Record<string,unknown>={},actor=principal())=>
 'select public.social_publication_reconciliation_complete('+json(actor)+','+json(input(v))+');';
const run=(v:Record<string,unknown>={},actor=principal())=>
 JSON.parse(f.sql('set local role service_role;'+rpc(v,actor)));

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const name of ['source-revision-probe.sql','social-review-source-fixture.sql',
 'social-worker-claim-source-fixture.sql','social-worker-step-recovery-fixture.sql',
 'social-reconcile-source-fixture.sql']){
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+name),'utf8'));
 }
 f.sql(readFileSync(resolve(process.cwd(),
  'lib/calendar/direct-write-gate-probe.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),
  'lib/calendar/direct-write-gate-reconcile-integration-probe.sql'),'utf8'));
},60000);
beforeEach(()=>{
 // Disposable, owner-controlled fixture seeding only.
 f.sql('alter table public.social_publications disable trigger user;'+
  'alter table public.social_schedule_jobs disable trigger user;'+
  'delete from public.social_publication_reconciliation_proofs;'+
 'delete from public.social_publication_events;delete from public.social_schedule_events;'+
 'delete from public.social_schedule_jobs;delete from public.social_schedule_decisions;'+
 'delete from public.social_schedule_batches;delete from public.social_publications;'+
 'delete from public.social_content_revisions;delete from public.calendar_source_revision_probe;');
 f.sql('insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
  [USER_A,PROJECT_A].map(quote).join(',')+',1),('+
  [USER_B,PROJECT_B].map(quote).join(',')+',7);');
 f.sql('insert into public.social_content_revisions(id,post_id,project_id,sha256) values('+
  [ids.revision,ids.post,PROJECT_A,sha].map(quote).join(',')+');'+
  'insert into public.social_schedule_batches(id,batch_id,project_id,sequence,manifest,sha256,created_by,idempotency_key,input_data) values('+
  [ids.batch,randomUUID(),PROJECT_A].map(quote).join(',')+",1,'{}'::jsonb,"+
  quote(sha)+','+quote(USER_A)+','+quote('batch-'+ids.batch.replaceAll('-',''))+",'{}'::jsonb);"+
  'insert into public.social_schedule_decisions(id,project_id,batch_revision_id,action,actor,idempotency_key,input_data) values('+
  [ids.approval,PROJECT_A,ids.batch,'approve',USER_A,'approve-'+ids.approval.replaceAll('-','')].map(quote).join(',')+",'{}'::jsonb);"+
  'insert into public.social_publications(id,project_id,post_id,state,channel,job_id,authority_source,revision_id,sha256,account_id,version) values('+
  [ids.pub,PROJECT_A,ids.post,'uncertain','facebook',ids.job,'scheduled',ids.revision,sha,'12345'].map(quote).join(',')+',1);');
 const scheduled='2026-11-24T19:30:00.000Z',expires='2026-11-24T19:40:00.000Z';
 f.sql('insert into public.social_schedule_jobs(id,project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,state,publication_id) values('+
  [ids.job,PROJECT_A,ids.batch,ids.approval,ids.post,ids.revision,sha,'facebook',ids.occasion,scheduled,expires].map(quote).join(',')+
  ",'{}'::jsonb,"+quote('uncertain')+','+quote(ids.pub)+');'+
  'insert into public.social_publication_reconciliation_proofs(id,publication_id,project_id,revision_id,revision_sha256,reviewed_asset_sha256,candidate,candidate_hash,version) values('+
  [ids.proof,ids.pub,PROJECT_A,ids.revision,sha,'c'.repeat(64)].map(quote).join(',')+
  ','+json(candidate)+','+quote(candidateHash)+',1);'+
  'alter table public.social_publications enable trigger user;'+
  'alter table public.social_schedule_jobs enable trigger user;');
},60000);
afterAll(()=>f?.close(),60000);

describe('signed guard and triggered social receipt reconciliation',()=>{
 it('keeps reconciliation completion service_role-only',()=>{
  expect(f.sql("select has_function_privilege('authenticated',"+
   "'public.social_publication_reconciliation_complete(jsonb,jsonb)','EXECUTE')")).toBe('f');
  expect(f.sql("select has_function_privilege('service_role',"+
   "'public.social_publication_reconciliation_complete(jsonb,jsonb)','EXECUTE')")).toBe('t');
  expect(()=>f.sql(rpc(),USER_A)).toThrow(/permission denied/i);
 });
 it('rejects missing source revision before locking project or publication',()=>{
  f.sql('delete from public.calendar_source_revision_probe where project_id='+quote(PROJECT_A));
  expect(()=>run()).toThrow(/MISSING_SOURCE_REVISION/);
  expect(state()).toBe('uncertain');expect(jobState()).toBe('uncertain');
  expect(events('social_publication_events')).toBe(0);
 });
 it('commits a reviewed uncertain receipt, its queued job and version together',()=>{
  const result=run();
  expect(result.state).toBe('published');
  expect(state()).toBe('published');expect(jobState()).toBe('published');
  expect(revision()).toBe('3');expect(revision(USER_B,PROJECT_B)).toBe('7');
  expect(events('social_publication_events')).toBe(1);
  expect(events('social_schedule_events')).toBe(1);
  expect(f.sql('select event from public.social_schedule_events')).toBe('receipt_reconciled');
 });
 it('same proof and receipt can be confirmed again without a second source bump',()=>{
  run();
  const again=run();
  expect(again.state).toBe('published');expect(revision()).toBe('3');
  expect(events('social_publication_events')).toBe(1);
  expect(events('social_schedule_events')).toBe(1);
 });
 it('denies mismatched proof, stale expectedVersion and a foreign owner without mutation',()=>{
  expect(()=>run({candidateHash:'d'.repeat(64)})).toThrow(/SOCIAL_PUBLICATION_CONFLICT/);
  expect(()=>run({expectedVersion:2})).toThrow(/SOCIAL_PUBLICATION_CONFLICT/);
  expect(()=>run({},principal(USER_B,[PROJECT_A]))).toThrow(/SOCIAL_LAUNCH_NOT_FOUND/);
  expect(state()).toBe('uncertain');expect(revision()).toBe('1');
  expect(events('social_publication_events')).toBe(0);
 });
 it('refuses an expired proof and a too-old read timestamp',()=>{
  f.sql("update public.social_publication_reconciliation_proofs set "+
   "created_at=clock_timestamp()-interval '1 hour',"+
   "expires_at=clock_timestamp()-interval '1 minute' where id="+quote(ids.proof));
  expect(()=>run()).toThrow(/SOCIAL_PUBLICATION_CONFLICT/);
  f.sql("update public.social_publication_reconciliation_proofs set "+
   "expires_at=clock_timestamp()+interval '5 minutes' where id="+quote(ids.proof));
  expect(()=>run({readAt:new Date(Date.now()-60_000).toISOString()})).toThrow(/SOCIAL_PUBLICATION_CONFLICT/);
  expect(revision()).toBe('1');expect(jobState()).toBe('uncertain');
 });
 it('never accepts an unconfirmed image or a publication still in flight',()=>{
  expect(()=>run({imageConfirmed:false})).toThrow(/SOCIAL_PUBLICATION_INVALID_BODY/);
  // The fixture owner can seed a provider-in-flight state ONLY in disposable DB.
  f.sql('alter table public.social_publications disable trigger user;'+
   'update public.social_publications set state='+quote('creating')+
   ' where id='+quote(ids.pub)+';'+
   'alter table public.social_publications enable trigger user;');
  expect(()=>run()).toThrow(/SOCIAL_PUBLICATION_REVIEW_REQUIRED/);
  expect(revision()).toBe('1');expect(events('social_publication_events')).toBe(0);
 });
 it('detects a still-unguarded proof INSERT as a separate integrity blocker',()=>{
  const newId=randomUUID();
  const table='public.social_publication_reconciliation_proofs';
  f.sql('set local role service_role;insert into '+table+
   ' (id,publication_id,project_id,revision_id,revision_sha256,'+
   'reviewed_asset_sha256,candidate,candidate_hash,version) '+
   'select '+quote(newId)+',publication_id,project_id,revision_id,'+
   'revision_sha256,reviewed_asset_sha256,candidate,candidate_hash,version '+
   'from '+table+' where id='+quote(ids.proof)+';');
  expect(events('social_publication_reconciliation_proofs')).toBe(2);
  expect(revision()).toBe('1'); // proof table is not yet in the signed gate
  expect(state()).toBe('uncertain');expect(jobState()).toBe('uncertain');
 });
 it('rejects ungated privileged status changes after a successful receipt commit',()=>{
  run();
  expect(()=>f.sql('set local role service_role;'+
   'update public.social_publications set state='+quote('failed')+
   ' where id='+quote(ids.pub))).toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(state()).toBe('published');expect(jobState()).toBe('published');
  expect(revision()).toBe('3');
 });
 it('rolls back job, publication, both evidence writes and source revision after a late SQL fault',()=>{
  expect(()=>f.sql('set local role service_role;'+rpc()+'select 1/0;')).toThrow();
  expect(state()).toBe('uncertain');expect(jobState()).toBe('uncertain');
  expect(revision()).toBe('1');expect(revision(USER_B,PROJECT_B)).toBe('7');
  expect(events('social_publication_events')).toBe(0);
  expect(events('social_schedule_events')).toBe(0);
 });
});
