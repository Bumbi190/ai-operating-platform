import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const jobId=randomUUID(),claimId=randomUUID(),pubId=randomUUID(),
 postId=randomUUID(),contentId=randomUUID(),batchId=randomUUID(),
 approvalId=randomUUID(),occasionId=randomUUID();
const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const claim={jobId,claimId,version:1};
const recover="select public.social_schedule_recover_checkpoint("+quote(JSON.stringify(claim))+"::jsonb);";
const auth="begin;set local role authenticated;set local \"request.jwt.claim.sub\"="+quote(USER_A)+";";
const version=()=>f.sql("select revision from public.calendar_source_revision_probe where owner_user_id="+quote(USER_A)+
 " and project_id="+quote(PROJECT_A));
const jobState=()=>f.sql("select state from public.social_schedule_jobs where id="+quote(jobId));
const pubState=()=>f.sql("select state from public.social_publications where id="+quote(pubId));
const events=()=>f.sql('select count(*) from public.social_schedule_events');
const calendarEvents=()=>f.sql('select count(*) from public.user_calendar_events');
const batch=(expected:number,day:string)=>
 'select public.calendar_week_revision_batch_probe('+
 quote(JSON.stringify([{title:'Approved weekly task',startUtc:day+'T08:00:00.000Z',
  endUtc:day+'T09:00:00.000Z'}]))+"::jsonb,"+
 quote(randomUUID())+','+quote(PROJECT_A)+','+expected+');';

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of ['source-revision-probe.sql','owner-lock-candidate.sql',
  'batch-probe-candidate.sql','week-revision-batch-probe.sql',
  'social-review-source-fixture.sql','social-worker-claim-source-fixture.sql',
  'social-worker-claim-revision-candidate.sql','social-worker-step-recovery-fixture.sql',
  'social-worker-step-recovery-candidate.sql'])
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
},60000);
beforeEach(()=>{
 f.sql('delete from public.social_publication_events;delete from public.social_schedule_events;'+
  'delete from public.social_schedule_jobs;delete from public.social_schedule_decisions;'+
  'delete from public.social_schedule_batches;delete from public.social_publications;'+
  'delete from public.social_content_revisions;delete from public.calendar_source_revision_probe;'+
  'delete from public.user_calendar_events;');
 const start=new Date(Date.now()-10000).toISOString(),
  expire=new Date(Date.parse(start)+600000).toISOString();
 const item={decisionId:approvalId,bindingId:randomUUID(),accountId:'12345',releaseCondition:null};
 f.sql('insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
  [USER_A,PROJECT_A].map(quote).join(',')+',1);'+
  'insert into public.social_content_revisions(id,post_id,project_id,sha256) values('+
  [contentId,postId,PROJECT_A,'a'.repeat(64)].map(quote).join(',')+');'+
  'insert into public.social_schedule_batches(id,batch_id,project_id,sequence,manifest,sha256,created_by,idempotency_key,input_data) values('+
  [batchId,randomUUID(),PROJECT_A].map(quote).join(',')+",1,'{}'::jsonb,"+
  quote('a'.repeat(64))+','+quote(USER_A)+','+quote('proposal-'+batchId.replaceAll('-',''))+",'{}'::jsonb);"+
  'insert into public.social_schedule_decisions(id,project_id,batch_revision_id,action,actor,idempotency_key,input_data) values('+
  [approvalId,PROJECT_A,batchId,'approve',USER_A,'approve-'+approvalId.replaceAll('-','')].map(quote).join(',')+",'{}'::jsonb);"+
  'insert into public.social_publications(id,project_id,post_id,state,channel,job_id) values('+
  [pubId,PROJECT_A,postId,'creating','facebook',jobId].map(quote).join(',')+');'+
  'insert into public.social_schedule_jobs(id,project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item,state,claim_id,worker_id,lease_expires_at,publication_id) values('+
  [jobId,PROJECT_A,batchId,approvalId,postId,contentId,'a'.repeat(64),'facebook',
   occasionId,start,expire].map(quote).join(',')+','+quote(JSON.stringify(item))+'::jsonb,'+
  [ 'claimed',claimId,'atlas-worker' ].map(quote).join(',')+
  ",now()+interval '90 seconds',"+quote(pubId)+');');
},60000);
afterAll(()=>f?.close(),60000);

function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql',
  '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';const listeners:((s:string)=>void)[]=[];
 p.stdout.on('data',b=>{output+=b;listeners.forEach(fn=>fn(output));});
 p.stderr.on('data',b=>{output+=b;listeners.forEach(fn=>fn(output));});
 return {send:(s:string)=>p.stdin.write(s+'\n'),end:()=>p.stdin.end(),output:()=>output,
  wait:(tag:string)=>new Promise<void>((ok,fail)=>{
   if(output.includes(tag))return ok();
   listeners.push(s=>{if(s.includes(tag))ok();});
   p.once('close',()=>fail(Error('closed before '+tag)));
  }),
  closed:new Promise<{code:number|null;output:string}>(ok=>p.once('close',code=>ok({code,output})))
 };
}
async function observedLock(fragment:string){
 for(let i=0;i<45;i++){
  const blocked=Number(f.sql("select count(*) from pg_stat_activity where datname="+
   quote(f.database)+" and wait_event_type='Lock' and query like '%"+fragment+"%'"));
  if(blocked>0)return true;
  await new Promise<void>(ok=>setTimeout(ok,50));
 }
 return false;
}
describe('calendar source transaction vs history-only provider recovery',()=>{
 it('a weekly batch commits first, then recovery records an uncertain publication safely',async()=>{
  const a=session();a.send(auth);a.send(batch(1,'2026-11-20'));
  a.send("select 'BATCH_HELD';");await a.wait('BATCH_HELD');
  const b=session();b.send('begin;set local role service_role;');
  b.send(recover);b.send("select 'RECOVER_DONE';");
  try{
   expect(await observedLock('social_schedule_recover_checkpoint')).toBe(true);
   expect(version()).toBe('1');expect(jobState()).toBe('claimed');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.send('commit;');b.end();const result=await b.closed;
   expect(result.code).toBe(0);expect(result.output).toContain('RECOVER_DONE');
  }
  expect(calendarEvents()).toBe('1');expect(version()).toBe('2');
  expect(jobState()).toBe('uncertain');expect(pubState()).toBe('uncertain');
  expect(events()).toBe('1');
 },20000);
 it('recovery commits first, then a calendar batch using stale source revision refuses to write',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(recover);a.send("select 'RECOVERY_HELD';");await a.wait('RECOVERY_HELD');
  const b=session();b.send(auth);b.send(batch(1,'2026-11-21'));
  b.send("select 'BATCH_DONE';");
  try{
   expect(await observedLock('calendar_week_revision_batch_probe')).toBe(true);
   expect(calendarEvents()).toBe('0');expect(version()).toBe('1');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.end();const result=await b.closed;
   expect(result.code).not.toBe(0);expect(result.output).toMatch(/STALE_SOURCE/);
  }
  expect(version()).toBe('2');expect(calendarEvents()).toBe('0');
  expect(jobState()).toBe('uncertain');expect(events()).toBe('1');
 },20000);
 it('two identical recoveries serialize; second stale claim fails without double evidence or bump',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(recover);a.send("select 'FIRST_RECOVERY_HELD';");await a.wait('FIRST_RECOVERY_HELD');
  const b=session();b.send('begin;set local role service_role;');
  b.send(recover);b.send("select 'SECOND_RECOVERY_DONE';");
  try{
   expect(await observedLock('social_schedule_recover_checkpoint')).toBe(true);
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.end();const result=await b.closed;
   expect(result.code).not.toBe(0);expect(result.output).toMatch(/SOCIAL_SCHEDULE_CONFLICT/);
  }
  expect(version()).toBe('2');expect(events()).toBe('1');
  expect(jobState()).toBe('uncertain');
  expect(f.sql('select count(*) from public.social_publication_events')).toBe('1');
 },20000);
});
