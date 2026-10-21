import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
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
 for(const name of ['source-revision-probe.sql','owner-lock-candidate.sql','batch-probe-candidate.sql','week-revision-batch-probe.sql','social-review-source-fixture.sql',
 'social-worker-claim-source-fixture.sql','social-worker-step-recovery-fixture.sql',
 'social-reconcile-source-fixture.sql']){
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+name),'utf8'));
 }
 const helpers=readFileSync(resolve(process.cwd(),
  'lib/calendar/social-monthly-rule-revision-candidate.sql'),'utf8');
 f.sql(helpers.split('create or replace function public.social_schedule_monthly_rule_save(')[0]);
 f.sql(readFileSync(resolve(process.cwd(),
  'lib/calendar/social-reconcile-revision-candidate.sql'),'utf8'));
},60000);
beforeEach(()=>{
 f.sql('delete from public.user_calendar_events;delete from public.social_publication_reconciliation_proofs;'+
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
  ','+json(candidate)+','+quote(candidateHash)+',1);');
},60000);
afterAll(()=>f?.close(),60000);


const batch=(expected:number,day:string)=>
 'select public.calendar_week_revision_batch_probe('+json([{
  title:'Approved calendar block',startUtc:day+'T08:00:00.000Z',
  endUtc:day+'T09:00:00.000Z'
 }])+','+quote(randomUUID())+','+quote(PROJECT_A)+','+expected+');';
const auth="begin;set local role authenticated;set local \"request.jwt.claim.sub\"="+quote(USER_A)+';';
const calendarEvents=()=>Number(f.sql('select count(*) from public.user_calendar_events'));
function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql',
  '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';const listeners:((text:string)=>void)[]=[];
 p.stdout.on('data',b=>{output+=b;listeners.forEach(fn=>fn(output));});
 p.stderr.on('data',b=>{output+=b;listeners.forEach(fn=>fn(output));});
 return {send:(s:string)=>p.stdin.write(s+'\n'),end:()=>p.stdin.end(),output:()=>output,
  wait:(marker:string)=>new Promise<void>((ok,fail)=>{
   if(output.includes(marker))return ok();
   listeners.push(x=>{if(x.includes(marker))ok();});
   p.once('close',()=>fail(Error('closed before '+marker)));
  }),
  closed:new Promise<{code:number|null;output:string}>(ok=>p.once('close',code=>ok({code,output})))
 };
}
async function blockedOn(fragment:string){
 for(let i=0;i<50;i++){
  const n=Number(f.sql("select count(*) from pg_stat_activity where datname="+quote(f.database)+
   " and wait_event_type='Lock' and query like '%"+fragment+"%'"));
  if(n>0)return true;
  await new Promise<void>(ok=>setTimeout(ok,50));
 }
 return false;
}

describe('calendar approval batch versus social publication proof reconciliation',()=>{
 it('calendar batch first makes reconciliation wait, then both commits serialize',async()=>{
  const a=session();a.send(auth);a.send(batch(1,'2026-11-20'));
  a.send("select 'BATCH_LOCKED';");await a.wait('BATCH_LOCKED');
  const b=session();b.send('begin;set local role service_role;');
  b.send(rpc());b.send("select 'RECONCILE_COMPLETE';");
  try{
   expect(await blockedOn('social_publication_reconciliation_complete')).toBe(true);
   expect(b.output()).not.toContain('RECONCILE_COMPLETE');
   expect(state()).toBe('uncertain');expect(revision()).toBe('1');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.send('commit;');b.end();const finished=await b.closed;
   expect(finished.code).toBe(0);
   expect(finished.output).toContain('RECONCILE_COMPLETE');
  }
  expect(calendarEvents()).toBe(1);expect(state()).toBe('published');
  expect(jobState()).toBe('published');expect(revision()).toBe('2');
  expect(events('social_schedule_events')).toBe(1);
 },20000);
 it('reconciliation first makes a stale calendar batch fail after the proof commits',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(rpc());a.send("select 'RECONCILIATION_HELD';");await a.wait('RECONCILIATION_HELD');
  const b=session();b.send(auth);b.send(batch(1,'2026-11-21'));
  b.send("select 'BATCH_COMPLETE';");
  try{
   expect(await blockedOn('calendar_week_revision_batch_probe')).toBe(true);
   expect(b.output()).not.toContain('BATCH_COMPLETE');
   expect(revision()).toBe('1');expect(state()).toBe('uncertain');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.end();const completed=await b.closed;
   expect(completed.code).not.toBe(0);expect(completed.output).toMatch(/STALE_SOURCE/);
  }
  expect(calendarEvents()).toBe(0);expect(revision()).toBe('2');
  expect(state()).toBe('published');expect(events('social_publication_events')).toBe(1);
 },20000);
 it('two identical confirmation attempts serialize; second is read-only with one audit record',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(rpc());a.send("select 'FIRST_HELD';");await a.wait('FIRST_HELD');
  const b=session();b.send('begin;set local role service_role;');
  b.send(rpc());b.send("select 'SECOND_COMPLETE';");
  try{
   expect(await blockedOn('social_publication_reconciliation_complete')).toBe(true);
   expect(b.output()).not.toContain('SECOND_COMPLETE');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.send('commit;');b.end();const finished=await b.closed;
   expect(finished.code).toBe(0);
   expect(finished.output).toContain('SECOND_COMPLETE');
  }
  expect(state()).toBe('published');expect(jobState()).toBe('published');
  expect(revision()).toBe('2');expect(calendarEvents()).toBe(0);
  expect(events('social_publication_events')).toBe(1);
  expect(events('social_schedule_events')).toBe(1);
 },20000);
});
