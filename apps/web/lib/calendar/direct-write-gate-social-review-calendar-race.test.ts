import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const post=randomUUID(),contentRevision=randomUUID();
const manifest={projectId:PROJECT_A,items:[{
 postId:post,revisionId:contentRevision,sha256:'a'.repeat(64),
 decisionId:randomUUID(),planRevisionId:randomUUID(),bindingId:randomUUID(),
 accountId:'12345',channel:'instagram',
 asset:{id:randomUUID(),sha256:'b'.repeat(64)},
 localMinute:'2026-11-25T20:30',scheduledAt:'2026-11-25T19:30:00.000Z',
 expiresAt:'2026-11-25T19:40:00.000Z',
 occasionId:randomUUID(),kind:'ordinary',releaseCondition:null
}]};
const principal={userId:USER_A,allowedProjectIds:[PROJECT_A]};
const proposalInput={projectId:PROJECT_A,manifest,expectedRevisionId:null,idempotencyKey:'proposal-race-1'};
const quote=(v:unknown)=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
const social=(action:string,input:unknown)=>
 'select public.social_schedule_'+action+'('+quote(principal)+','+quote(input)+');';
const batch=(revision:number,date:string)=>
 'select public.calendar_week_revision_batch_probe('+quote([{
  title:'Human-approved week block',startUtc:date+'T08:00:00.000Z',
  endUtc:date+'T09:00:00.000Z'
 }])+",'"+randomUUID()+"','"+PROJECT_A+"',"+revision+');';
const auth="begin;set local role authenticated;set local \"request.jwt.claim.sub\"='"+USER_A+"';";
const revision=()=>f.sql("select revision from public.calendar_source_revision_probe where owner_user_id='"+
 USER_A+"' and project_id='"+PROJECT_A+"'");
const count=(table:string)=>Number(f.sql('select count(*) from public.'+table));
let proposal:{batchId:string;revisionId:string;sha256:string;version:number};
let approvalInput:Record<string,unknown>;

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const filename of [
  'source-revision-probe.sql',
  'owner-lock-candidate.sql',
  'batch-probe-candidate.sql',
  'week-revision-batch-probe.sql',
  'social-review-source-fixture.sql'
 ])f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+filename),'utf8'));
 const monthly=readFileSync(resolve(process.cwd(),'lib/calendar/social-monthly-rule-revision-candidate.sql'),'utf8');
 f.sql(monthly.split('create or replace function public.social_schedule_monthly_rule_save(')[0]);
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/direct-write-gate-probe.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/direct-write-gate-social-review-integration-probe.sql'),'utf8'));
 f.sql("insert into public.social_content_revisions(id,post_id,project_id,sha256) values('"+
  contentRevision+"','"+post+"','"+PROJECT_A+"','"+manifest.items[0].sha256+"')");
 f.sql("insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+
  USER_A+"','"+PROJECT_A+"',1)");
},60000);
afterAll(()=>f?.close(),60000);

function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql',
  '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';
 const listeners:((value:string)=>void)[]=[];
 p.stdout.on('data',v=>{output+=v;listeners.forEach(fn=>fn(output));});
 p.stderr.on('data',v=>{output+=v;listeners.forEach(fn=>fn(output));});
 return {
  send:(s:string)=>p.stdin.write(s+'\n'),end:()=>p.stdin.end(),output:()=>output,
  wait:(tag:string)=>new Promise<void>((ok,fail)=>{
   if(output.includes(tag))return ok();
   listeners.push(s=>{if(s.includes(tag))ok();});
   p.once('close',()=>fail(Error('Session closed before '+tag)));
  }),
  closed:new Promise<{code:number|null;output:string}>(ok=>p.once('close',code=>ok({code,output})))
 };
}
async function waitForLock(fragment:string){
 for(let i=0;i<50;i++){
  const blocked=f.sql("select count(*) from pg_stat_activity where datname='"+f.database+
   "' and wait_event_type='Lock' and query like '%"+fragment+"%'");
  if(Number(blocked)>0)return true;
  await new Promise<void>(resolve=>setTimeout(resolve,50));
 }
 return false;
}

describe('signed guard: social owner review vs atomic weekly batch',()=>{
 it('a calendar batch commits first; pending social proposal waits and then bumps revision',async()=>{
  const a=session();a.send(auth);a.send(batch(1,'2026-11-19'));
  a.send("select 'BATCH_HELD';");await a.wait('BATCH_HELD');
  const b=session();b.send('begin;set local role service_role;');
  b.send(social('propose',proposalInput));b.send("select 'PROPOSAL_COMPLETE';");
  try{
   expect(await waitForLock('social_schedule_propose')).toBe(true);
   expect(b.output()).not.toContain('PROPOSAL_COMPLETE');
   expect(count('user_calendar_events')).toBe(0);
   expect(count('social_schedule_batches')).toBe(0);
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.send('commit;');b.end();const result=await b.closed;
   expect(result.code).toBe(0);expect(result.output).toContain('PROPOSAL_COMPLETE');
  }
  expect(count('user_calendar_events')).toBe(1);
  expect(count('social_schedule_batches')).toBe(1);
  expect(revision()).toBe('2');
  proposal=JSON.parse(f.sql('set local role service_role;'
   +"select public.social_schedule_propose("+quote(principal)+","+quote(proposalInput)+")"));
  approvalInput={projectId:PROJECT_A,batchId:proposal.batchId,
   revisionId:proposal.revisionId,sha256:proposal.sha256,
   confirmed:true,idempotencyKey:'approve-race-1'};
 },20000);

 it('approval commits first; a stale calendar batch is rejected after waiting',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(social('approve',approvalInput));
  a.send("select 'APPROVAL_HELD';");await a.wait('APPROVAL_HELD');
  const b=session();b.send(auth);b.send(batch(2,'2026-11-20'));
  b.send("select 'BATCH_COMPLETE';");
  try{
   expect(await waitForLock('calendar_week_revision_batch_probe')).toBe(true);
   expect(b.output()).not.toContain('BATCH_COMPLETE');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.end();const outcome=await b.closed;
   expect(outcome.code).not.toBe(0);
   expect(outcome.output).toMatch(/STALE_SOURCE/);
  }
  expect(revision()).toBe('3');expect(count('user_calendar_events')).toBe(1);
  expect(count('social_schedule_jobs')).toBe(1);
 },20000);

 it('two identical approvals serialize without creating a duplicate job/version',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(social('approve',approvalInput));a.send("select 'REPLAY_HELD';");
  await a.wait('REPLAY_HELD');
  const b=session();b.send('begin;set local role service_role;');
  b.send(social('approve',approvalInput));b.send("select 'REPLAY_COMPLETE';");
  try{
   expect(await waitForLock('social_schedule_approve')).toBe(true);
   expect(b.output()).not.toContain('REPLAY_COMPLETE');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.send('commit;');b.end();
   const result=await b.closed;expect(result.code).toBe(0);
  }
  expect(count('social_schedule_jobs')).toBe(1);expect(revision()).toBe('3');
 },20000);

 it('revocation waits for an ongoing calendar batch; the job cancels afterward',async()=>{
  const a=session();a.send(auth);a.send(batch(3,'2026-11-23'));
  a.send("select 'BATCH_HELD';");await a.wait('BATCH_HELD');
  const b=session();b.send('begin;set local role service_role;');
  b.send(social('revoke',{projectId:PROJECT_A,batchId:proposal.batchId,expectedVersion:2}));
  b.send("select 'REVOKE_COMPLETE';");
  try{
   expect(await waitForLock('social_schedule_revoke')).toBe(true);
   expect(b.output()).not.toContain('REVOKE_COMPLETE');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.send('commit;');b.end();
   const result=await b.closed;expect(result.code).toBe(0);
  }
  expect(revision()).toBe('5');
  expect(count('user_calendar_events')).toBe(2);
  expect(f.sql("select state from public.social_schedule_jobs where post_id='"+post+"'")).toBe('cancelled');
  expect(count('social_schedule_jobs')).toBe(1);
 },20000);
});
