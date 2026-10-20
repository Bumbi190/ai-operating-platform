import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const jobA=randomUUID(),jobB=randomUUID();
const q=(v:string)=>"'"+v.replaceAll("'","''")+"'";
const revision=(who:string,project:string)=>f.sql(
 'select revision from public.calendar_source_revision_probe where owner_user_id='+q(who)+
 ' and project_id='+q(project));
const status=(job:string)=>f.sql('select state from public.social_schedule_jobs where id='+q(job));
const calendarEvents=()=>f.sql('select count(*) from public.user_calendar_events');
const authA="begin;set local role authenticated;set local \"request.jwt.claim.sub\"='"+USER_A+"';";
const batch=(revision:number,day:string)=>'select public.calendar_week_revision_batch_probe('+
 q(JSON.stringify([{title:'Human-approved work block',
  startUtc:day+'T08:00:00.000Z',endUtc:day+'T09:00:00.000Z'}]))+'::jsonb,'+
 q(randomUUID())+','+q(PROJECT_A)+','+revision+');';
const worker=(projects:string[])=>'select public.social_schedule_claim('+
 q(JSON.stringify({workerId:'atlas-worker-race',now:new Date().toISOString(),
  dryRun:false,projectIds:projects}))+'::jsonb);';

function seed(id:string,project:string,owner:string){
 const batchId=randomUUID(),revisionId=randomUUID(),postId=randomUUID(),
  contentRevision=randomUUID(),approval=randomUUID(),occasion=randomUUID();
 const scheduled=new Date(Date.now()-15000).toISOString();
 const expires=new Date(Date.parse(scheduled)+600000).toISOString();
 f.sql('insert into public.social_content_revisions(id,post_id,project_id,sha256) values('+
  [contentRevision,postId,project,'a'.repeat(64)].map(q).join(',')+');'+
  'insert into public.social_schedule_batches(id,batch_id,project_id,sequence,manifest,sha256,created_by,idempotency_key,input_data) values('+
  [batchId,randomUUID(),project].map(q).join(',')+",1,'{}'::jsonb,"+q('a'.repeat(64))+','+
  q(owner)+','+q('batch-'+batchId.replaceAll('-',''))+",'{}'::jsonb);"+
  'insert into public.social_schedule_decisions(id,project_id,batch_revision_id,action,actor,idempotency_key,input_data) values('+
  [approval,project,batchId,'approve',owner,'approval-'+approval.replaceAll('-','')].map(q).join(',')+",'{}'::jsonb);"+
  'insert into public.social_schedule_jobs(id,project_id,batch_revision_id,approval_id,post_id,revision_id,revision_sha256,channel,occasion_id,scheduled_at,expires_at,item) values('+
  [id,project,batchId,approval,postId,contentRevision,'a'.repeat(64),'facebook',
   occasion,scheduled,expires].map(q).join(',')+",'{\"releaseCondition\":null}'::jsonb);");
}
beforeAll(()=>{
 f=initializeCalendarDb();
 for(const name of ['source-revision-probe.sql','owner-lock-candidate.sql',
  'batch-probe-candidate.sql','week-revision-batch-probe.sql',
  'social-review-source-fixture.sql','social-worker-claim-source-fixture.sql',
  'social-worker-claim-revision-candidate.sql']){
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+name),'utf8'));
 }
 f.sql('insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
  [USER_A,PROJECT_A].map(q).join(',')+',1),('+[USER_B,PROJECT_B].map(q).join(',')+',1)');
 seed(jobA,PROJECT_A,USER_A);
 seed(jobB,PROJECT_B,USER_B);
},60000);
afterAll(()=>f?.close(),60000);
function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql',
  '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';const listeners:((s:string)=>void)[]=[];
 p.stdout.on('data',b=>{output+=b;listeners.forEach(fn=>fn(output));});
 p.stderr.on('data',b=>{output+=b;listeners.forEach(fn=>fn(output));});
 return {send:(sql:string)=>p.stdin.write(sql+'\n'),end:()=>p.stdin.end(),output:()=>output,
  wait:(text:string)=>new Promise<void>((yes,no)=>{
   if(output.includes(text))return yes();
   listeners.push(s=>{if(s.includes(text))yes();});
   p.once('close',()=>no(Error('closed before '+text)));
  }),
  closed:new Promise<{code:number|null;output:string}>(yes=>p.once('close',code=>yes({code,output})))};
}
async function locked(queryName:string){
 for(let i=0;i<50;i++){
  const n=f.sql("select count(*) from pg_stat_activity where datname="+q(f.database)+
   " and wait_event_type='Lock' and query like '%"+queryName+"%'");
  if(Number(n)>0)return true;
  await new Promise(done=>setTimeout(done,50));
 }
 return false;
}

describe('source lock contention between weekly batch and social worker claim',()=>{
 it('worker skips a batched project A and claims independent project B without waiting',async()=>{
  const a=session();a.send(authA);a.send(batch(1,'2026-11-18'));
  a.send("select 'BATCH_A_HELD';");await a.wait('BATCH_A_HELD');
  const b=session();b.send('begin;set local role service_role;');
  b.send(worker([PROJECT_A,PROJECT_B]));b.send("select 'WORKER_DONE';");
  let arrived=false;
  try{
   arrived=await Promise.race([
    b.wait('WORKER_DONE').then(()=>true),
    new Promise<boolean>(yes=>setTimeout(()=>yes(false),4500))
   ]);
   expect(arrived).toBe(true);
   expect(b.output()).toContain(jobB);
   expect(b.output()).not.toContain(jobA);
   b.send('commit;');b.end();expect((await b.closed).code).toBe(0);
   expect(status(jobA)).toBe('queued');expect(status(jobB)).toBe('claimed');
   expect(revision(USER_A,PROJECT_A)).toBe('1');
   expect(revision(USER_B,PROJECT_B)).toBe('2');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   if(!arrived){b.send('rollback;');b.end();await b.closed;}
  }
  expect(calendarEvents()).toBe('1');
 },20000);
 it('worker claim commits first; a week batch using prior source revision fails',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(worker([PROJECT_A]));a.send("select 'WORKER_A_HELD';");await a.wait('WORKER_A_HELD');
  const b=session();b.send(authA);b.send(batch(1,'2026-11-19'));
  b.send("select 'BATCH_COMPLETED';");
  try{
   expect(await locked('calendar_week_revision_batch_probe')).toBe(true);
   expect(b.output()).not.toContain('BATCH_COMPLETED');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.end();const result=await b.closed;
   expect(result.code).not.toBe(0);
   expect(result.output).toMatch(/STALE_SOURCE/);
  }
  expect(status(jobA)).toBe('claimed');
  expect(revision(USER_A,PROJECT_A)).toBe('2');
  expect(calendarEvents()).toBe('1');
 },20000);
});
