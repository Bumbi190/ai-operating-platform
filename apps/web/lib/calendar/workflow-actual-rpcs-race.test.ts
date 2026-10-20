import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const instance='50000000-0000-4000-8000-000000000001';
beforeAll(()=>{
 f=initializeCalendarDb();
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));
 f.sql(`create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),status text not null default 'active',current_state text not null default 'ready',wake_at timestamptz);
 create table public.workflow_evidence(instance_id uuid not null,state text not null,check_key text not null,result text not null,source text not null,detail jsonb not null);
 insert into public.workflow_instances(id,project_id) values('${instance}','${PROJECT_A}')`);
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-wake-trigger-candidate.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-actual-rpcs-candidate.sql'),'utf8'));
 f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);
},60000);
afterAll(()=>f?.close(),60000);
function session(){const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);let output='';const listeners:((v:string)=>void)[]=[];p.stdout.on('data',x=>{output+=x;listeners.forEach(cb=>cb(output));});p.stderr.on('data',x=>{output+=x;listeners.forEach(cb=>cb(output));});return {send:(s:string)=>p.stdin.write(s+'\n'),end:()=>p.stdin.end(),wait:(m:string)=>new Promise<void>((yes,no)=>{if(output.includes(m))return yes();listeners.push(x=>{if(x.includes(m))yes();});p.once('close',()=>no(Error('closed before '+m)));}),closed:new Promise<{code:number|null;output:string}>(yes=>p.once('close',code=>yes({code,output}))),output:()=>output};}
describe('two original workflow RPCs with revision-first locking',()=>{
 it('serializes schedule and clear without deadlock and keeps both audit rows',async()=>{
  const a=session();a.send('begin;');a.send(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}' for update;`);a.send("select 'REVISION_LOCKED';");await a.wait('REVISION_LOCKED');
  const b=session();b.send('begin;');b.send(`select (public.workflow_clear_wake('${instance}','Atlas','clear')).id;`);b.send("select 'CLEARED';");
  let waiting=false;
  for(let i=0;i<40&&!waiting;i++){
   await new Promise(done=>setTimeout(done,50));
   waiting=f.sql(`select count(*) from pg_stat_activity where datname='${f.database}' and wait_event_type='Lock' and query like '%workflow_clear_wake%'`)==='1';
  }
  expect(waiting).toBe(true);
  expect(b.output()).not.toContain('CLEARED');
  a.send(`select (public.workflow_schedule_wake('${instance}','2026-11-27T08:00:00Z','Atlas','schedule')).id;`);a.send("select 'SCHEDULED';");await a.wait('SCHEDULED');
  a.send('commit;');a.end();expect((await a.closed).code).toBe(0);
  b.send('commit;');b.end();const doneB=await b.closed;expect(doneB.code).toBe(0);expect(doneB.output).toContain('CLEARED');expect(doneB.output).not.toMatch(/deadlock detected/i);
  expect(f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}'`)).toBe('3');
  expect(f.sql(`select wake_at from public.workflow_instances where id='${instance}'`)).toBe('');
  expect(f.sql(`select string_agg(check_key,',' order by check_key) from public.workflow_evidence`)).toBe('scheduler.wake_cleared,scheduler.wake_scheduled');
 },20000);
});
