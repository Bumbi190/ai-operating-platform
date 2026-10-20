import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const instance='50000000-0000-4000-8000-000000000001';
beforeAll(()=>{f=initializeCalendarDb();f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));f.sql(`create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),wake_at timestamptz);insert into public.workflow_instances values('${instance}','${PROJECT_A}',null)`);f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-wake-trigger-candidate.sql'),'utf8'));f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);},60000);
afterAll(()=>f?.close(),60000);
function session(){const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);let output='';const callbacks:((v:string)=>void)[]=[];p.stdout.on('data',x=>{output+=x;callbacks.forEach(cb=>cb(output));});p.stderr.on('data',x=>{output+=x;callbacks.forEach(cb=>cb(output));});return {send:(s:string)=>p.stdin.write(s+'\n'),end:()=>p.stdin.end(),wait:(marker:string)=>new Promise<void>((yes,no)=>{if(output.includes(marker))return yes();callbacks.push(v=>{if(v.includes(marker))yes();});p.once('close',()=>no(Error('closed before '+marker)));}),closed:new Promise<{code:number|null;output:string}>(yes=>p.once('close',code=>yes({code,output}))),output:()=>output};}
describe('workflow-first vs revision-first row lock inversion',()=>{
 it('exposes a deadlock cycle in isolated SQL, with no committed wake change',async()=>{
  const a=session();a.send('begin;');a.send(`select id from public.workflow_instances where id='${instance}' for update;`);a.send("select 'WORKFLOW_HELD';");await a.wait('WORKFLOW_HELD');
  const b=session();b.send('begin;');b.send(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}' for update;`);b.send("select 'REVISION_HELD';");await b.wait('REVISION_HELD');
  a.send(`update public.calendar_source_revision_probe set revision=revision+1 where owner_user_id='${USER_A}' and project_id='${PROJECT_A}';`);
  b.send(`update public.workflow_instances set wake_at='2026-11-20T08:00:00Z' where id='${instance}';`);
  a.send("select 'A_DONE';");b.send("select 'B_DONE';");a.send('commit;');b.send('commit;');a.end();b.end();
  const [one,two]=await Promise.all([a.closed,b.closed]);
  expect([one.output,two.output].join(' ')).toMatch(/deadlock detected/i);
  expect([one.code,two.code]).toContain(3);
 },20000);
});
