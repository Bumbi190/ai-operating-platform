import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const instance='50000000-0000-4000-8000-000000000001';
beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of ['source-revision-probe.sql'])f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 f.sql(`create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),status text not null default 'active',current_state text not null default 'ready',wake_at timestamptz,last_tick_at timestamptz,last_tick_outcome text);
 create table public.workflow_evidence(instance_id uuid not null,state text not null,check_key text not null,result text not null,source text not null,detail jsonb not null);
 insert into public.workflow_instances(id,project_id) values('${instance}','${PROJECT_A}')`);
 for(const file of ['workflow-wake-trigger-candidate.sql','workflow-actual-rpcs-candidate.sql','workflow-record-tick-candidate.sql'])f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);
},60000);
afterAll(()=>f?.close(),60000);
function session(){const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);let output='';const listeners:((x:string)=>void)[]=[];p.stdout.on('data',b=>{output+=b;listeners.forEach(fn=>fn(output));});p.stderr.on('data',b=>{output+=b;listeners.forEach(fn=>fn(output));});return {send:(s:string)=>p.stdin.write(s+'\n'),end:()=>p.stdin.end(),wait:(marker:string)=>new Promise<void>((resolve,reject)=>{if(output.includes(marker))return resolve();listeners.push(x=>{if(x.includes(marker))resolve();});p.once('close',()=>reject(Error('closed before '+marker)));}),closed:new Promise<{code:number|null;output:string}>(resolve=>p.once('close',code=>resolve({code,output}))),output:()=>output};}
describe('record_tick and schedule RPC share source revision lock',()=>{
 it('blocks tick until schedule commits, then logs both changes without deadlock',async()=>{
  const schedule=session();schedule.send('begin;');schedule.send(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}' for update;`);schedule.send("select 'REVISION_HELD';");await schedule.wait('REVISION_HELD');
  const tick=session();tick.send('begin;');tick.send(`select public.workflow_record_tick('${instance}','waiting','{}'::jsonb,'2026-11-30T11:00:00Z');`);tick.send("select 'TICK_DONE';");
  let waiting=false;
  for(let i=0;i<40&&!waiting;i++){await new Promise(resolve=>setTimeout(resolve,50));waiting=f.sql(`select count(*) from pg_stat_activity where datname='${f.database}' and wait_event_type='Lock' and query like '%workflow_record_tick%'`)==='1';}
  expect(waiting).toBe(true);expect(tick.output()).not.toContain('TICK_DONE');
  schedule.send(`select (public.workflow_schedule_wake('${instance}','2026-11-30T08:00:00Z','Atlas','plan')).id;`);
  schedule.send("select 'SCHEDULE_DONE';");await schedule.wait('SCHEDULE_DONE');schedule.send('commit;');schedule.end();expect((await schedule.closed).code).toBe(0);
  tick.send('commit;');tick.end();const finished=await tick.closed;
  expect(finished.code).toBe(0);expect(finished.output).toContain('TICK_DONE');expect(finished.output).not.toMatch(/deadlock detected/i);
  expect(f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}'`)).toBe('3');
  expect(f.sql(`select wake_at from public.workflow_instances where id='${instance}'`)).toContain('11:00:00');
  expect(f.sql(`select string_agg(check_key,',' order by check_key) from public.workflow_evidence`)).toBe('scheduler.evaluation,scheduler.wake_scheduled');
 },20000);
});
