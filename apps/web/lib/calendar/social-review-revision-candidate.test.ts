import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const post=randomUUID(),revisionId=randomUUID(),occasionId=randomUUID();
const item={
 postId:post,revisionId,sha256:'a'.repeat(64),decisionId:randomUUID(),
 planRevisionId:randomUUID(),bindingId:randomUUID(),accountId:'12345',channel:'facebook',
 asset:{id:randomUUID(),sha256:'b'.repeat(64)},
 localMinute:'2026-11-24T20:30',scheduledAt:'2026-11-24T19:30:00.000Z',
 expiresAt:'2026-11-24T19:40:00.000Z',
 occasionId,kind:'ordinary',releaseCondition:null
};
const principal=(user=USER_A,allowed=[PROJECT_A])=>({userId:user,allowedProjectIds:allowed});
const manifest={projectId:PROJECT_A,items:[item]};
const pInput=(key='proposal-1',extra={})=>({
 projectId:PROJECT_A,manifest,expectedRevisionId:null,idempotencyKey:key,...extra
});
const aInput=(batch:{batchId:string;revisionId:string;sha256:string},key='approval-1',extra={})=>({
 projectId:PROJECT_A,batchId:batch.batchId,revisionId:batch.revisionId,
 sha256:batch.sha256,confirmed:true,idempotencyKey:key,...extra
});
const rInput=(batchId:string,version:number)=>({projectId:PROJECT_A,batchId,expectedVersion:version});
const quote=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const sql=(name:string,input:unknown,actor=principal())=>
 'select public.social_schedule_'+name+'('+quote(actor)+','+quote(input)+');';
const run=(name:string,input:unknown,actor=principal())=>JSON.parse(f.sql('set local role service_role;'+sql(name,input,actor)));
const source=(user=USER_A,project=PROJECT_A)=>f.sql(
 "select revision from public.calendar_source_revision_probe where owner_user_id='"+user+"' and project_id='"+project+"'");
const count=(table:string)=>Number(f.sql('select count(*) from public.'+table));
const events=(name:string)=>Number(f.sql(
 "select count(*) from public.social_schedule_events where event='"+name+"'"));
const state=()=>f.sql("select state from public.social_schedule_jobs where post_id='"+post+"'");
let batch:{batchId:string;revisionId:string;sha256:string;version:number;status:string};

beforeAll(()=>{
 f=initializeCalendarDb();
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/social-review-source-fixture.sql'),'utf8'));
 const helpers=readFileSync(resolve(process.cwd(),'lib/calendar/social-monthly-rule-revision-candidate.sql'),'utf8');
 f.sql(helpers.split('create or replace function public.social_schedule_monthly_rule_save(')[0]);
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/social-review-revision-candidate.sql'),'utf8'));
 f.sql("insert into public.social_content_revisions(id,post_id,project_id,sha256) values('"+
  revisionId+"','"+post+"','"+PROJECT_A+"','"+item.sha256+"')");
},60000);
afterAll(()=>f?.close(),60000);

describe('social propose/approve/revoke source revisions, idempotence and rollback',()=>{
 it('restricts all review RPCs to service_role only',()=>{
  for(const name of ['propose','approve','revoke']){
   expect(f.sql("select has_function_privilege('authenticated','public.social_schedule_"+name+
    "(jsonb,jsonb)','EXECUTE')")).toBe('f');
   expect(f.sql("select has_function_privilege('service_role','public.social_schedule_"+name+
    "(jsonb,jsonb)','EXECUTE')")).toBe('t');
  }
  expect(()=>f.sql(sql('propose',pInput()),USER_A)).toThrow(/permission denied/i);
 });
 it('fails closed before any proposal exists if source version is missing',()=>{
  expect(()=>run('propose',pInput())).toThrow(/MISSING_SOURCE_REVISION/);
  expect(count('social_schedule_batches')).toBe(0);
  expect(count('social_schedule_events')).toBe(0);
 });
 it('creates a proposal and bumps source exactly once, even on idempotent replay',()=>{
  f.sql("insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+
   USER_A+"','"+PROJECT_A+"',1),('"+USER_B+"','"+PROJECT_B+"',7)");
  batch=run('propose',pInput());
  expect(batch.version).toBe(1);expect(batch.status).toBe('proposal');
  expect(count('social_schedule_batches')).toBe(1);
  expect(events('proposed')).toBe(1);expect(source()).toBe('2');
  const replay=run('propose',pInput());
  expect(replay.revisionId).toBe(batch.revisionId);
  expect(count('social_schedule_batches')).toBe(1);
  expect(events('proposed')).toBe(1);expect(source()).toBe('2');
  expect(source(USER_B,PROJECT_B)).toBe('7');
 });
 it('rejects a conflicting reused proposal key and a foreign owner',()=>{
  expect(()=>run('propose',pInput('proposal-1',{expectedRevisionId:batch.revisionId})))
   .toThrow(/SOCIAL_SCHEDULE_CONFLICT/);
  expect(()=>run('propose',pInput('proposal-foreign'),principal(USER_B,[PROJECT_A])))
   .toThrow(/SOCIAL_LAUNCH_NOT_FOUND/);
  expect(source()).toBe('2');expect(events('proposed')).toBe(1);
 });
 it('creates an approved job exactly once and never bumps on same-key replay',()=>{
  const approved=run('approve',aInput(batch));
  expect(approved.status).toBe('approved');expect(approved.version).toBe(2);
  expect(count('social_schedule_jobs')).toBe(1);expect(state()).toBe('queued');
  expect(events('approved')).toBe(1);expect(source()).toBe('3');
  const replay=run('approve',aInput(batch));
  expect(replay.approval.id).toBe(approved.approval.id);
  expect(count('social_schedule_jobs')).toBe(1);expect(source()).toBe('3');
  expect(()=>run('approve',aInput(batch,'approval-other'))).toThrow(/SOCIAL_SCHEDULE_CONFLICT/);
  expect(count('social_schedule_decisions')).toBe(1);
  expect(source(USER_B,PROJECT_B)).toBe('7');
 });
 it('rolls back an attempted revoke if any later SQL operation fails',()=>{
  expect(()=>f.sql('set local role service_role;'+sql('revoke',rInput(batch.batchId,2))+'select 1/0;'))
   .toThrow();
  expect(count('social_schedule_decisions')).toBe(1);
  expect(state()).toBe('queued');expect(source()).toBe('3');
 });
 it('cancels approved pending job once, and a repeated revoke does not bump',()=>{
  const revoked=run('revoke',rInput(batch.batchId,2));
  expect(revoked.status).toBe('revoked');expect(revoked.version).toBe(3);
  expect(state()).toBe('cancelled');
  expect(count('social_schedule_jobs')).toBe(1);
  expect(count('social_schedule_decisions')).toBe(2);
  expect(source()).toBe('4');
  expect(run('revoke',rInput(batch.batchId,3)).status).toBe('revoked');
  expect(count('social_schedule_decisions')).toBe(2);expect(source()).toBe('4');
  expect(()=>run('revoke',rInput(batch.batchId,2))).toThrow(/SOCIAL_SCHEDULE_CONFLICT/);
  expect(source(USER_B,PROJECT_B)).toBe('7');
 });
});
