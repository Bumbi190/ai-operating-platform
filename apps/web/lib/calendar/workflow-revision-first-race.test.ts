import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const instance='50000000-0000-4000-8000-000000000001';
beforeAll(()=>{f=initializeCalendarDb();f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));f.sql(`create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),wake_at timestamptz);insert into public.workflow_instances values('${instance}','${PROJECT_A}',null)`);f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-wake-trigger-candidate.sql'),'utf8'));f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-revision-first-candidate.sql'),'utf8'));f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);},60000);
afterAll(()=>f?.close(),60000);
function session(){const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);let output='';const callbacks:((v:string)=>void)[]=[];p.stdout.on('data',x=>{output+=x;callbacks.forEach(cb=>cb(output));});p.stderr.on('data',x=>{output+=x;callbacks.forEach(cb=>cb(output));});return {send:(s:string)=>p.stdin.write(s+'\n'),end:()=>p.stdin.end(),wait:(marker:string)=>new Promise<void>((yes,no)=>{if(output.includes(marker))return yes();callbacks.push(v=>{if(v.includes(marker))yes();});p.once('close',()=>no(Error('closed before '+marker)));}),closed:new Promise<{code:number|null;output:string}>(yes=>p.once('close',code=>yes({code,output}))),output:()=>output};}
const write=(time:string)=>`select public.calendar_workflow_wake_revision_first_probe('${instance}','${time}'::timestamptz);`;
describe('revision-first workflow writers avoid inversion under concurrency',()=>{
 it('serializes two workflow writes while the first transaction holds its source lock',async()=>{
  const first=session();first.send('begin;');first.send(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}' for update;`);first.send("select 'SOURCE_LOCK_HELD';");await first.wait('SOURCE_LOCK_HELD');
  const second=session();second.send('begin;');second.send(write('2026-11-22T09:00:00Z'));second.send("select 'SECOND_DONE';");
  let waiting=false;for(let i=0;i<40&&!waiting;i++){await new Promise(r=>setTimeout(r,50));waiting=f.sql(`select count(*) from pg_stat_activity where datname='${f.database}' and wait_event_type='Lock' and query like '%calendar_workflow_wake_revision_first_probe%'`)==='1';}
  expect(waiting).toBe(true);
  expect(second.output()).not.toContain('SECOND_DONE');
  first.send(write('2026-11-22T08:00:00Z'));first.send("select 'FIRST_DONE';");await first.wait('FIRST_DONE');first.send('commit;');first.end();expect((await first.closed).code).toBe(0);
  second.send('commit;');second.end();const final=await second.closed;expect(final.code).toBe(0);expect(final.output).toContain('SECOND_DONE');expect(final.output).not.toMatch(/deadlock detected/i);
  expect(f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}'`)).toBe('3');
  expect(f.sql(`select wake_at from public.workflow_instances where id='${instance}'`)).toContain('09:00:00');
 },20000);
});
