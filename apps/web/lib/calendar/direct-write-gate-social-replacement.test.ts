import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const sha='a'.repeat(64);
const posts=Array.from({length:3},()=>({postId:randomUUID(),revisionId:randomUUID()}));
const principal={userId:USER_A,allowedProjectIds:[PROJECT_A]};
const item=(n:number)=>{
 const day=24+n;
 return {
  ...posts[n],sha256:sha,decisionId:randomUUID(),planRevisionId:randomUUID(),
  bindingId:randomUUID(),accountId:'12345',channel:'facebook',
  asset:{id:randomUUID(),sha256:'b'.repeat(64)},
  localMinute:'2026-11-'+day+'T20:30',
  scheduledAt:'2026-11-'+day+'T19:30:00.000Z',
  expiresAt:'2026-11-'+day+'T19:40:00.000Z',
  occasionId:randomUUID(),kind:'ordinary',releaseCondition:null
 };
};
const manifests=[0,1,2].map(n=>({projectId:PROJECT_A,items:[item(n)]}));
const propose=(n:number,expectedRevisionId:string|null,key:string)=>({
 projectId:PROJECT_A,manifest:manifests[n],expectedRevisionId,idempotencyKey:key
});
const quote=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const run=(name:string,input:unknown)=>JSON.parse(f.sql('set local role service_role;'
 +'select public.social_schedule_'+name+'('+quote(principal)+','+quote(input)+')'));
const revision=()=>f.sql("select revision from public.calendar_source_revision_probe where owner_user_id='"
 +USER_A+"' and project_id='"+PROJECT_A+"'");
const state=(postId:string)=>f.sql("select state from public.social_schedule_jobs where post_id='"+postId+"'");
const count=(table:string)=>f.sql('select count(*) from public.'+table);
const approve=(b:{batchId:string;revisionId:string;sha256:string},key:string)=>({
 projectId:PROJECT_A,batchId:b.batchId,revisionId:b.revisionId,
 sha256:b.sha256,confirmed:true,idempotencyKey:key
});
let first:{batchId:string;revisionId:string;sha256:string};
let second:{batchId:string;revisionId:string;sha256:string};

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of ['source-revision-probe.sql','social-review-source-fixture.sql'])
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 const helper=readFileSync(resolve(process.cwd(),'lib/calendar/social-monthly-rule-revision-candidate.sql'),'utf8');
 f.sql(helper.split('create or replace function public.social_schedule_monthly_rule_save(')[0]);
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/direct-write-gate-probe.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/direct-write-gate-social-review-integration-probe.sql'),'utf8'));
 for(const p of posts){
  f.sql("insert into public.social_content_revisions(id,post_id,project_id,sha256) values('"+
   p.revisionId+"','"+p.postId+"','"+PROJECT_A+"','"+sha+"')");
 }
 f.sql("insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+
  USER_A+"','"+PROJECT_A+"',1)");
},60000);
afterAll(()=>f?.close(),60000);

describe('signed source gate: new proposal cancels an approved social job',()=>{
 it('starts with an owner-approved proposal and one queued job',()=>{
  first=run('propose',propose(0,null,'initial'));
  expect(run('approve',approve(first,'approve-initial')).status).toBe('approved');
  expect(state(posts[0].postId)).toBe('queued');
  expect(revision()).toBe('3');
  expect(count('social_schedule_jobs')).toBe('1');
 });
 it('new revision revokes approval, cancels job and records separate metadata/job bumps',()=>{
  second=run('propose',propose(1,first.revisionId,'revised'));
  expect(second.batchId).toBe(first.batchId);
  expect(second.revisionId).not.toBe(first.revisionId);
  expect(state(posts[0].postId)).toBe('cancelled');
  expect(count('social_schedule_batches')).toBe('2');
  expect(count('social_schedule_decisions')).toBe('2');
  expect(count('social_schedule_jobs')).toBe('1');
  expect(revision()).toBe('5');
  const old=f.sql("select reason from public.social_schedule_decisions where action='revoke'");
  expect(old).toBe('revision_changed');
  const replay=run('propose',propose(1,first.revisionId,'revised'));
  expect(replay.revisionId).toBe(second.revisionId);
  expect(revision()).toBe('5');
  expect(count('social_schedule_decisions')).toBe('2');
 });
 it('denies an unguarded direct UPDATE of the cancelled job after proposal COMMIT',()=>{
  expect(()=>f.sql('set local role service_role;'+
   "update public.social_schedule_jobs set state='claimed' where post_id='"+posts[0].postId+"'"))
   .toThrow(/CALENDAR_WRITE_GATE_REQUIRED/);
  expect(state(posts[0].postId)).toBe('cancelled');
  expect(revision()).toBe('5');
 });
 it('only the new revision may now be approved, and it adds one distinct job',()=>{
  expect(()=>run('approve',approve(first,'stale-approval'))).toThrow(/SOCIAL_SCHEDULE_CONFLICT/);
  expect(run('approve',approve(second,'approve-revised')).status).toBe('approved');
  expect(revision()).toBe('6');
  expect(count('social_schedule_jobs')).toBe('2');
  expect(state(posts[0].postId)).toBe('cancelled');
  expect(state(posts[1].postId)).toBe('queued');
 });
 it('an injected failure after a further revision restores approval and schedule atomically',()=>{
  const stmt='set local role service_role;select public.social_schedule_propose('+
   quote(principal)+','+quote(propose(2,second.revisionId,'would-rollback'))+');select 1/0;';
  expect(()=>f.sql(stmt)).toThrow();
  expect(revision()).toBe('6');
  expect(state(posts[1].postId)).toBe('queued');
  expect(count('social_schedule_decisions')).toBe('3');
  expect(count('social_schedule_batches')).toBe('2');
  expect(count('social_schedule_jobs')).toBe('2');
 });
});
