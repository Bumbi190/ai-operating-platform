import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const pubA='50000000-0000-4000-8000-000000000011';
const pubB='50000000-0000-4000-8000-000000000012';
const quote=(text:string)=>"'"+text.replaceAll("'","''")+"'";
const ownerAuth="begin;set local role authenticated;set local \"request.jwt.claim.sub\"="+quote(USER_A)+";";
const claim=(project=PROJECT_A)=>
 'select public.calendar_source_gate_begin_probe('+quote(project)+');';
const edit=(id=pubA)=>
 "update public.social_publications set state='published' where id="+quote(id)+';';
const revision=(who=USER_A,project=PROJECT_A)=>
 f.sql('select revision from public.calendar_source_revision_probe where owner_user_id='+
 quote(who)+' and project_id='+quote(project));
const state=(id=pubA)=>f.sql('select state from public.social_publications where id='+quote(id));
const batch=(date:string)=>
 'select public.calendar_week_revision_batch_probe('+
 quote(JSON.stringify([{title:'Human-approved calendar task',
 startUtc:date+'T08:00:00.000Z',endUtc:date+'T09:00:00.000Z'}]))+
 '::jsonb,'+quote(randomUUID())+','+quote(PROJECT_A)+',1);';

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const name of ['source-revision-probe.sql','owner-lock-candidate.sql',
 'batch-probe-candidate.sql','week-revision-batch-probe.sql']){
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+name),'utf8'));
 }
 f.sql('create table public.social_publications ('+
  "id uuid primary key, project_id uuid not null references public.projects(id),"+
  "state text not null default 'requested');"+
  'create table public.social_schedule_jobs ('+
  "id uuid primary key, project_id uuid not null references public.projects(id),"+
  "state text not null default 'queued');"+
  'revoke all on public.social_publications,public.social_schedule_jobs '+
  'from public,anon,authenticated,service_role;'+
  'grant select,insert,update on public.social_publications,public.social_schedule_jobs '+
  'to service_role;');
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/direct-write-gate-probe.sql'),'utf8'));
},60000);
beforeEach(()=>{
 f.sql('alter table public.social_publications disable trigger user;'+
  'truncate public.social_publications;'+
  'delete from public.user_calendar_events;'+
  'delete from public.calendar_source_revision_probe;'+
  'insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
  [USER_A,PROJECT_A].map(quote).join(',')+',1),('+
  [USER_B,PROJECT_B].map(quote).join(',')+',7);'+
  'insert into public.social_publications(id,project_id,state) values('+
  [pubA,PROJECT_A,'requested'].map(quote).join(',')+'),('+
  [pubB,PROJECT_B,'requested'].map(quote).join(',')+');'+
  'alter table public.social_publications enable trigger user;');
},60000);
afterAll(()=>f?.close(),60000);

function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql',
 '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';
 const listeners:((s:string)=>void)[]=[];
 p.stdout.on('data',x=>{output+=x;listeners.forEach(fn=>fn(output));});
 p.stderr.on('data',x=>{output+=x;listeners.forEach(fn=>fn(output));});
 return {send:(sql:string)=>p.stdin.write(sql+'\n'),end:()=>p.stdin.end(),
  output:()=>output,
  wait:(tag:string)=>new Promise<void>((yes,no)=>{
   if(output.includes(tag))return yes();
   listeners.push(s=>{if(s.includes(tag))yes();});
   p.once('close',()=>no(Error('closed before '+tag)));
  }),
  closed:new Promise<{code:number|null;output:string}>(yes=>p.once('close',
   code=>yes({code,output})))
 };
}
async function waitingOn(fragment:string){
 for(let i=0;i<55;i++){
  const blocked=Number(f.sql("select count(*) from pg_stat_activity where datname="+
   quote(f.database)+" and wait_event_type='Lock' and query like '%"+fragment+"%'"));
  if(blocked>0)return true;
  await new Promise<void>(resolve=>setTimeout(resolve,50));
 }
 return false;
}

describe('source-first write marker survives real calendar contention',()=>{
 it('a calendar batch holding A blocks A writer but leaves project B writable',async()=>{
  const book=session();book.send(ownerAuth);book.send(batch('2026-11-20'));
  book.send("select 'BATCH_A_LOCKED';");await book.wait('BATCH_A_LOCKED');
  const a=session();a.send('begin;set local role service_role;');
  a.send(claim());a.send(edit());a.send("select 'A_DONE';");
  const b=session();b.send('begin;set local role service_role;');
  b.send(claim(PROJECT_B));b.send(edit(pubB));b.send("select 'B_DONE';");
  try{
   expect(await waitingOn('calendar_source_gate_begin_probe')).toBe(true);
   await Promise.race([
    b.wait('B_DONE'),
    new Promise<never>((_,reject)=>setTimeout(
     ()=>reject(Error('Independent project B was blocked')),4500))
   ]);
   b.send('commit;');b.end();expect((await b.closed).code).toBe(0);
   expect(state()).toBe('requested');expect(state(pubB)).toBe('published');
   expect(revision()).toBe('1');expect(revision(USER_B,PROJECT_B)).toBe('8');
  }finally{
   book.send('commit;');book.end();expect((await book.closed).code).toBe(0);
   a.send('commit;');a.end();const done=await a.closed;
   expect(done.code).toBe(0);expect(done.output).toContain('A_DONE');
  }
  expect(state()).toBe('published');expect(revision()).toBe('2');
  expect(f.sql('select count(*) from public.user_calendar_events')).toBe('1');
 },20000);
 it('a source-gated DML commits first; a stale calendar approval refuses to write',async()=>{
  const writer=session();writer.send('begin;set local role service_role;');
  writer.send(claim());writer.send(edit());writer.send("select 'WRITER_LOCKED';");
  await writer.wait('WRITER_LOCKED');
  const book=session();book.send(ownerAuth);book.send(batch('2026-11-21'));
  book.send("select 'BATCH_COMPLETE';");
  try{
   expect(await waitingOn('calendar_week_revision_batch_probe')).toBe(true);
   expect(revision()).toBe('1');expect(state()).toBe('requested');
  }finally{
   writer.send('commit;');writer.end();expect((await writer.closed).code).toBe(0);
   book.end();const done=await book.closed;
   expect(done.code).not.toBe(0);expect(done.output).toMatch(/STALE_SOURCE/);
  }
  expect(revision()).toBe('2');expect(state()).toBe('published');
  expect(f.sql('select count(*) from public.user_calendar_events')).toBe('0');
 },20000);
 it('UNGATED direct UPDATE is refused promptly while calendar owns the source lock',async()=>{
  const book=session();book.send(ownerAuth);book.send(batch('2026-11-22'));
  book.send("select 'BATCH_HELD';");await book.wait('BATCH_HELD');
  const writer=session();writer.send('begin;set local role service_role;');
  writer.send(edit());
  let done:{code:number|null;output:string};
  try{
   writer.end();
   done=await Promise.race([
    writer.closed,
    new Promise<never>((_,reject)=>setTimeout(
     ()=>reject(Error('Unguarded trigger unexpectedly waited on the source row')),4000))
   ]);
   expect(done.code).not.toBe(0);
   expect(done.output).toMatch(/CALENDAR_WRITE_GATE_REQUIRED/);
   expect(done.output).not.toMatch(/deadlock detected/i);
   expect(revision()).toBe('1');expect(state()).toBe('requested');
  }finally{
   book.send('commit;');book.end();expect((await book.closed).code).toBe(0);
  }
  expect(f.sql('select count(*) from public.user_calendar_events')).toBe('1');
 },20000);
 it('two guarded DML writers to the SAME project serialize with no deadlock',async()=>{
  const a=session();a.send('begin;set local role service_role;');
  a.send(claim());a.send(edit());a.send("select 'FIRST_HELD';");
  await a.wait('FIRST_HELD');
  const b=session();b.send('begin;set local role service_role;');
  b.send(claim());b.send("update public.social_publications set state='failed' where id="+quote(pubA)+';');
  b.send("select 'SECOND_DONE';");
  try{
   expect(await waitingOn('calendar_source_gate_begin_probe')).toBe(true);
   expect(b.output()).not.toContain('SECOND_DONE');
  }finally{
   a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
   b.send('commit;');b.end();const result=await b.closed;
   expect(result.code).toBe(0);
   expect(result.output).toContain('SECOND_DONE');
   expect(result.output).not.toMatch(/deadlock detected/i);
  }
  expect(revision()).toBe('3');expect(state()).toBe('failed');
 },20000);
});
