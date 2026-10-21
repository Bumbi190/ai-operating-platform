import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const q=(s:string)=>"'"+s.replaceAll("'","''")+"'";
const releaseInput={projectId:PROJECT_A,releaseMonth:'2026-12',
 catalogSha256:'a'.repeat(64),customerViewUrl:'https://familje-stunden.se/december',confirmed:true};
const owner={userId:USER_A,allowedProjectIds:[PROJECT_A]};
const rpc="select public.social_schedule_release_confirm("+q(JSON.stringify(owner))+
 "::jsonb,"+q(JSON.stringify(releaseInput))+"::jsonb);";
const auth="begin;set local role authenticated;set local \"request.jwt.claim.sub\"="+q(USER_A)+";";
const batch=(version:number,date:string)=>'select public.calendar_week_revision_batch_probe('+
 q(JSON.stringify([{title:'Approved month launch',startUtc:date+'T08:00:00.000Z',
 endUtc:date+'T09:00:00.000Z'}]))+"::jsonb,"+q(randomUUID())+','+q(PROJECT_A)+','+version+');';
const rev=()=>f.sql('select revision from public.calendar_source_revision_probe where owner_user_id='+
 q(USER_A)+' and project_id='+q(PROJECT_A));
const n=(table:string)=>Number(f.sql('select count(*) from public.'+table));

beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of ['source-revision-probe.sql','owner-lock-candidate.sql',
  'batch-probe-candidate.sql','week-revision-batch-probe.sql',
  'social-monthly-source-fixture.sql','social-release-confirm-source-fixture.sql'])
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 const helper=readFileSync(resolve(process.cwd(),
  'lib/calendar/social-monthly-rule-revision-candidate.sql'),'utf8');
 f.sql(helper.split('create or replace function public.social_schedule_monthly_rule_save(')[0]);
 f.sql(readFileSync(resolve(process.cwd(),
  'lib/calendar/social-release-confirm-revision-candidate.sql'),'utf8'));
},60000);
beforeEach(()=>{
 f.sql('delete from public.social_monthly_release_evidence;'+
  'delete from public.social_schedule_events;delete from public.user_calendar_events;'+
  'delete from public.calendar_source_revision_probe;');
 f.sql('insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('+
  q(USER_A)+','+q(PROJECT_A)+',1)');
},60000);
afterAll(()=>f?.close(),60000);

function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql',
 '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';
 const listeners:((text:string)=>void)[]=[];
 p.stdout.on('data',buf=>{output+=buf;listeners.forEach(fn=>fn(output));});
 p.stderr.on('data',buf=>{output+=buf;listeners.forEach(fn=>fn(output));});
 return {send:(text:string)=>p.stdin.write(text+'\n'),end:()=>p.stdin.end(),output:()=>output,
  wait:(marker:string)=>new Promise<void>((resolve,reject)=>{
   if(output.includes(marker))return resolve();
   listeners.push(text=>{if(text.includes(marker))resolve();});
   p.once('close',()=>reject(Error('closed before '+marker)));
  }),
  closed:new Promise<{code:number|null;output:string}>(resolve=>p.once('close',code=>resolve({code,output})))};
}
async function awaitLock(fragment:string){
 for(let i=0;i<48;i++){
  const count=Number(f.sql("select count(*) from pg_stat_activity where datname="+q(f.database)+
   " and wait_event_type='Lock' and query like '%"+fragment+"%'"));
  if(count>0)return true;
  await new Promise<void>(resolve=>setTimeout(resolve,50));
 }
 return false;
}

describe('month release confirmation vs atomic weekly booking',()=>{
 it('weekly batch commits first; release confirmation waits and then bumps the version',async()=>{
  const book=session();book.send(auth);book.send(batch(1,'2026-11-20'));
  book.send("select 'BATCH_HELD';");await book.wait('BATCH_HELD');
  const release=session();release.send('begin;set local role service_role;');
  release.send(rpc);release.send("select 'RELEASE_DONE';");
  try{
   expect(await awaitLock('social_schedule_release_confirm')).toBe(true);
   expect(release.output()).not.toContain('RELEASE_DONE');
   expect(rev()).toBe('1');expect(n('social_monthly_release_evidence')).toBe(0);
  }finally{
   book.send('commit;');book.end();expect((await book.closed).code).toBe(0);
   release.send('commit;');release.end();
   const result=await release.closed;expect(result.code).toBe(0);
   expect(result.output).toContain('RELEASE_DONE');
  }
  expect(rev()).toBe('2');expect(n('user_calendar_events')).toBe(1);
  expect(n('social_monthly_release_evidence')).toBe(1);
  expect(n('social_schedule_events')).toBe(1);
 },20000);
 it('release confirmation commits first; booking with old expected version is rejected',async()=>{
  const release=session();release.send('begin;set local role service_role;');
  release.send(rpc);release.send("select 'RELEASE_HELD';");await release.wait('RELEASE_HELD');
  const book=session();book.send(auth);book.send(batch(1,'2026-11-21'));
  book.send("select 'BATCH_DONE';");
  try{
   expect(await awaitLock('calendar_week_revision_batch_probe')).toBe(true);
   expect(book.output()).not.toContain('BATCH_DONE');
   expect(n('social_monthly_release_evidence')).toBe(0);
  }finally{
   release.send('commit;');release.end();expect((await release.closed).code).toBe(0);
   book.end();const result=await book.closed;
   expect(result.code).not.toBe(0);expect(result.output).toMatch(/STALE_SOURCE/);
  }
  expect(rev()).toBe('2');expect(n('user_calendar_events')).toBe(0);
  expect(n('social_monthly_release_evidence')).toBe(1);
 },20000);
 it('simultaneous identical confirmations intentionally append two evidence records',async()=>{
  const first=session();first.send('begin;set local role service_role;');
  first.send(rpc);first.send("select 'FIRST_HELD';");await first.wait('FIRST_HELD');
  const second=session();second.send('begin;set local role service_role;');
  second.send(rpc);second.send("select 'SECOND_DONE';");
  try{
   expect(await awaitLock('social_schedule_release_confirm')).toBe(true);
   expect(n('social_monthly_release_evidence')).toBe(0);
  }finally{
   first.send('commit;');first.end();expect((await first.closed).code).toBe(0);
   second.send('commit;');second.end();
   const result=await second.closed;expect(result.code).toBe(0);
   expect(result.output).toContain('SECOND_DONE');
  }
  expect(rev()).toBe('3');expect(n('social_monthly_release_evidence')).toBe(2);
  expect(n('social_schedule_events')).toBe(2);
 },20000);
});
