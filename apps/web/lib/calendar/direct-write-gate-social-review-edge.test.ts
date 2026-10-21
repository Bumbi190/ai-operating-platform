import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const who={userId:USER_A,allowedProjectIds:[PROJECT_A]};
const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const json=(v:unknown)=>quote(JSON.stringify(v))+'::jsonb';
const exec=(name:string,input:unknown)=>JSON.parse(
 f.sql('set local role service_role;select public.social_schedule_'+name+
 '('+json(who)+','+json(input)+')'));
const source=()=>f.sql('select revision from public.calendar_source_revision_probe where owner_user_id='+
 quote(USER_A)+' and project_id='+quote(PROJECT_A));
const other=()=>f.sql('select revision from public.calendar_source_revision_probe where owner_user_id='+
 quote(USER_B)+' and project_id='+quote(PROJECT_B));
const count=(table:string)=>Number(f.sql('select count(*) from public.'+table));
type Item={postId:string;revisionId:string;sha256:string;decisionId:string;
 planRevisionId:string;bindingId:string;accountId:string;channel:string;
 asset:{id:string;sha256:string};localMinute:string;scheduledAt:string;
 expiresAt:string;occasionId:string;kind:string;releaseCondition:null};
function item(day:number):Item{
 const date='2026-11-'+String(day).padStart(2,'0');
 return {
  postId:randomUUID(),revisionId:randomUUID(),sha256:'a'.repeat(64),
  decisionId:randomUUID(),planRevisionId:randomUUID(),bindingId:randomUUID(),
  accountId:'12345',channel:'facebook',asset:{id:randomUUID(),sha256:'b'.repeat(64)},
  localMinute:date+'T20:30',scheduledAt:date+'T19:30:00.000Z',
  expiresAt:date+'T19:40:00.000Z',occasionId:randomUUID(),
  kind:'ordinary',releaseCondition:null
 };
}
function makeApproved(items:Item[]){
 for(const i of items){
  f.sql('insert into public.social_content_revisions(id,post_id,project_id,sha256) values('+
   [i.revisionId,i.postId,PROJECT_A,i.sha256].map(quote).join(',')+');');
 }
 const proposal=exec('propose',{projectId:PROJECT_A,manifest:{projectId:PROJECT_A,items},
  expectedRevisionId:null,idempotencyKey:'proposal-'+randomUUID()}) as
   {batchId:string;revisionId:string;sha256:string};
 const approved=exec('approve',{projectId:PROJECT_A,batchId:proposal.batchId,
  revisionId:proposal.revisionId,sha256:proposal.sha256,confirmed:true,
  idempotencyKey:'approve-'+randomUUID()}) as {status:string;version:number};
 expect(approved.status).toBe('approved');
 return proposal;
}
function setUpInFlight(postId:string,state:string){
 const publicationId=randomUUID();
 const jobId=f.sql('select id from public.social_schedule_jobs where post_id='+quote(postId));
 // Test-data preparation by fixture owner only; never perform in production.
 f.sql('alter table public.social_publications disable trigger user;'+
  'alter table public.social_schedule_jobs disable trigger user;'+
  'insert into public.social_publications(id,project_id,post_id,state) values('+
  [publicationId,PROJECT_A,postId,state].map(quote).join(',')+');'+
  'update public.social_schedule_jobs set state='+quote('claimed')+
  ',publication_id='+quote(publicationId)+' where id='+quote(jobId)+';'+
  'alter table public.social_publications enable trigger user;'+
  'alter table public.social_schedule_jobs enable trigger user;');
 return {jobId,publicationId};
}
beforeAll(()=>{
 f=initializeCalendarDb();
 for(const name of ['source-revision-probe.sql','social-review-source-fixture.sql'])
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+name),'utf8'));
 const helper=readFileSync(resolve(process.cwd(),
  'lib/calendar/social-monthly-rule-revision-candidate.sql'),'utf8');
 f.sql(helper.split('create or replace function public.social_schedule_monthly_rule_save(')[0]);
 for(const name of ['direct-write-gate-probe.sql',
  'direct-write-gate-social-review-integration-probe.sql'])
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
  'alter table public.social_schedule_jobs enable trigger user;'+
  'insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
  [USER_A,PROJECT_A].map(quote).join(',')+',1),('+
  [USER_B,PROJECT_B].map(quote).join(',')+',7);');
},60000);
afterAll(()=>f?.close(),60000);

describe('edge cases for signed review decisions and cancellation',()=>{
 it('two-item approval records two job inserts, not an extra duplicate bump',()=>{
  const batch=makeApproved([item(24),item(25)]);
  expect(batch.revisionId).toBeTruthy();
  expect(count('social_schedule_jobs')).toBe(2);
  expect(count('social_schedule_decisions')).toBe(1);
  expect(source()).toBe('4'); // 1 source + 1 proposal + 2 job rows
  expect(other()).toBe('7');
 });
 it('revoke while provider might be creating marks uncertain, never a fresh post',()=>{
  const i=item(24);
  const batch=makeApproved([i]);
  expect(source()).toBe('3');
  const {jobId,publicationId}=setUpInFlight(i.postId,'creating');
  const result=exec('revoke',{projectId:PROJECT_A,batchId:batch.batchId,expectedVersion:2});
  expect(result.status).toBe('revoked');
  expect(f.sql('select state from public.social_publications where id='+quote(publicationId)))
   .toBe('uncertain');
  expect(f.sql('select state from public.social_schedule_jobs where id='+quote(jobId)))
   .toBe('uncertain');
  expect(count('social_publication_events')).toBe(1);
  expect(source()).toBe('6'); // decision metadata + publication row + job row
  const repeat=exec('revoke',{projectId:PROJECT_A,batchId:batch.batchId,expectedVersion:3});
  expect(repeat.status).toBe('revoked');expect(source()).toBe('6');
 });
 it('revoke does not undo an already provider-confirmed published publication',()=>{
  const i=item(24);
  const batch=makeApproved([i]);
  const {jobId,publicationId}=setUpInFlight(i.postId,'published');
  exec('revoke',{projectId:PROJECT_A,batchId:batch.batchId,expectedVersion:2});
  expect(f.sql('select state from public.social_publications where id='+quote(publicationId)))
   .toBe('published');
  expect(f.sql('select state from public.social_schedule_jobs where id='+quote(jobId)))
   .toBe('published');
  expect(count('social_publication_events')).toBe(0);
  expect(source()).toBe('5'); // decision and changed job, NOT publication
 });
 it('standalone privileged cancel helper takes a source gate before touching a job',()=>{
  const i=item(24);
  makeApproved([i]);
  const approval=f.sql("select id from public.social_schedule_decisions where action='approve'");
  f.sql('set local role service_role;select public.social_schedule_cancel_jobs('+
   [approval,USER_A,'owner_revoked'].map(quote).join(',')+');');
  expect(f.sql('select state from public.social_schedule_jobs where post_id='+quote(i.postId)))
   .toBe('cancelled');
  expect(source()).toBe('4'); // one job update, no metadata decision made
  expect(count('social_schedule_decisions')).toBe(1);
 });
});
