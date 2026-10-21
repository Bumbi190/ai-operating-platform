import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const post=randomUUID(),contentRev=randomUUID(),binding=randomUUID(),decision=randomUUID();
const sha='a'.repeat(64),capability='c'.repeat(64);
const principal={userId:USER_A,allowedProjectIds:[PROJECT_A]};
const prep={projectId:PROJECT_A,postId:post,revisionId:contentRev,sha256:sha,
 decisionId:decision,bindingId:binding,idempotencyKey:'race-prepare',confirmed:true};
const json=(value:unknown)=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
const manual=(name:'prepare'|'step',data:unknown)=>'select public.social_publication_'+
 name+'('+json(principal)+','+json(data)+');';
const auth="begin;set local role authenticated;set local \"request.jwt.claim.sub\"='"+USER_A+"';";
const calendar=(expected:number,date:string)=>'select public.calendar_week_revision_batch_probe('+
 json([{title:'Human-approved task',startUtc:date+'T08:00:00.000Z',
  endUtc:date+'T09:00:00.000Z'}])+",'"+randomUUID()+"','"+PROJECT_A+"',"+expected+');';
const rev=()=>f.sql("select revision from public.calendar_source_revision_probe where owner_user_id='"+
 USER_A+"' and project_id='"+PROJECT_A+"'");
const count=(table:string)=>Number(f.sql('select count(*) from public.'+table));
const prepared=()=>JSON.parse(f.sql('set local role service_role;'+manual('prepare',prep))) as {id:string;state:string;version:number};

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of ['source-revision-probe.sql','owner-lock-candidate.sql',
  'batch-probe-candidate.sql','week-revision-batch-probe.sql',
  'social-review-source-fixture.sql','social-manual-publication-source-fixture.sql'])
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 const helper=readFileSync(resolve(process.cwd(),
  'lib/calendar/social-monthly-rule-revision-candidate.sql'),'utf8');
 f.sql(helper.split('create or replace function public.social_schedule_monthly_rule_save(')[0]);
 f.sql(readFileSync(resolve(process.cwd(),
  'lib/calendar/social-manual-publication-revision-candidate.sql'),'utf8'));
 f.sql("insert into public.social_content_posts(id,project_id) values('"+post+"','"+PROJECT_A+"');"+
  "insert into public.social_content_revisions(id,post_id,project_id,sha256,binding_id,draft,binding) values('"+
  contentRev+"','"+post+"','"+PROJECT_A+"','"+sha+"','"+binding+
  "','{\"channel\":\"facebook\",\"format\":\"image\"}'::jsonb,'{\"accountId\":\"12345\",\"label\":\"test-account\"}'::jsonb)");
},60000);
beforeEach(()=>{
 f.sql('delete from public.social_publication_events;delete from public.social_publications;'+
 'delete from public.user_calendar_events;delete from public.calendar_source_revision_probe;'+
 "insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('"+
 USER_A+"','"+PROJECT_A+"',1)");
},60000);
afterAll(()=>f?.close(),60000);

function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql',
  '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';const listeners:((s:string)=>void)[]=[];
 p.stdout.on('data',x=>{output+=x;listeners.forEach(fn=>fn(output));});
 p.stderr.on('data',x=>{output+=x;listeners.forEach(fn=>fn(output));});
 return {
  send:(s:string)=>p.stdin.write(s+'\n'),end:()=>p.stdin.end(),output:()=>output,
  wait:(marker:string)=>new Promise<void>((yes,no)=>{
   if(output.includes(marker))return yes();
   listeners.push(x=>{if(x.includes(marker))yes();});
   p.once('close',()=>no(Error('Closed before '+marker)));
  }),
  closed:new Promise<{code:number|null;output:string}>(yes=>p.once('close',code=>yes({code,output})))
 };
}
async function waitingFor(fragment:string){
 for(let i=0;i<50;i++){
  const n=Number(f.sql("select count(*) from pg_stat_activity where datname='"+f.database+
   "' and wait_event_type='Lock' and query like '%"+fragment+"%'"));
  if(n>0)return true;
  await new Promise<void>(resolve=>setTimeout(resolve,50));
 }
 return false;
}

describe('manual publication writes vs an atomic calendar weekly batch',()=>{
 it('calendar batch first: manual prepare waits and then commits the new source revision',async()=>{
  const a=session();a.send(auth);a.send(calendar(1,'2026-11-20'));
  a.send("select 'BATCH_LOCKED';");await a.wait('BATCH_LOCKED');
  const b=session();b.send('begin;set local role service_role;');
  b.send(manual('prepare',prep));b.send("select 'PREPARE_DONE';");
  try{
   expect(await waitingFor('social_publication_prepare')).toBe(true);
   expect(rev()).toBe('1');expect(count('social_publications')).toBe(0);
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.send('commit;');b.end();const result=await b.closed;
   expect(result.code).toBe(0);expect(result.output).toContain('PREPARE_DONE');
  }
  expect(rev()).toBe('2');expect(count('user_calendar_events')).toBe(1);
  expect(count('social_publications')).toBe(1);expect(count('social_publication_events')).toBe(1);
 },20000);
 it('manual prepare first: a weekly batch with the old source version is rejected',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(manual('prepare',prep));a.send("select 'PREPARED';");await a.wait('PREPARED');
  const b=session();b.send(auth);b.send(calendar(1,'2026-11-21'));b.send("select 'BATCH_DONE';");
  try{
   expect(await waitingFor('calendar_week_revision_batch_probe')).toBe(true);
   expect(count('social_publications')).toBe(0);
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.end();const result=await b.closed;
   expect(result.code).not.toBe(0);expect(result.output).toMatch(/STALE_SOURCE/);
  }
  expect(rev()).toBe('2');expect(count('social_publications')).toBe(1);
  expect(count('user_calendar_events')).toBe(0);
 },20000);
 it('two identical concurrent prepares serialize to one publication, audit and revision',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(manual('prepare',prep));a.send("select 'FIRST_PREPARED';");await a.wait('FIRST_PREPARED');
  const b=session();b.send('begin;set local role service_role;');
  b.send(manual('prepare',prep));b.send("select 'REPLAY_DONE';");
  try{
   expect(await waitingFor('social_publication_prepare')).toBe(true);
   expect(count('social_publications')).toBe(0);
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.send('commit;');b.end();const result=await b.closed;
   expect(result.code).toBe(0);expect(result.output).toContain('REPLAY_DONE');
  }
  expect(count('social_publications')).toBe(1);expect(count('social_publication_events')).toBe(1);
  expect(rev()).toBe('2');
 },20000);
 it('manual status step first: a stale weekly batch cannot write over the new state',async()=>{
  const entry=prepared();expect(rev()).toBe('2');
  const statusInput={projectId:PROJECT_A,postId:post,publicationId:entry.id,
   expectedVersion:1,action:'claim_create',capabilityHash:capability};
  const a=session();a.send('begin;set local role service_role;');
  a.send(manual('step',statusInput));a.send("select 'STEP_LOCKED';");await a.wait('STEP_LOCKED');
  const b=session();b.send(auth);b.send(calendar(2,'2026-11-22'));b.send("select 'BATCH_DONE';");
  try{
   expect(await waitingFor('calendar_week_revision_batch_probe')).toBe(true);
   expect(rev()).toBe('2');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.end();const result=await b.closed;
   expect(result.code).not.toBe(0);expect(result.output).toMatch(/STALE_SOURCE/);
  }
  expect(rev()).toBe('3');expect(count('user_calendar_events')).toBe(0);
  expect(f.sql("select state from public.social_publications where id='"+entry.id+"'")).toBe('publishing');
 },20000);
});
