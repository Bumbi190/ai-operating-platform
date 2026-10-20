import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{f=initializeCalendarDb();f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);},60000);
afterAll(()=>f?.close(),60000);
const auth=`begin;set local role authenticated;set local "request.jwt.claim.sub"='${USER_A}';`;
function session(){const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);let out='';const listeners:((s:string)=>void)[]=[];p.stdout.on('data',d=>{out+=d.toString();listeners.forEach(fn=>fn(out));});p.stderr.on('data',d=>{out+=d.toString();listeners.forEach(fn=>fn(out));});return {send:(s:string)=>p.stdin.write(s+'\n'),end:()=>p.stdin.end(),waitFor:(marker:string)=>new Promise<void>((yes,no)=>{if(out.includes(marker))return yes();listeners.push(v=>{if(v.includes(marker))yes();});p.on('close',()=>no(Error('session closed before '+marker)));}),closed:new Promise<{code:number|null;out:string}>(yes=>p.on('close',code=>yes({code,out}))),read:()=>out};}
describe('deterministic revision row lock order',()=>{
 it('blocks second writer until the first transaction commits',async()=>{
  const a=session();a.send(auth);a.send(`select public.calendar_source_revision_probe_compare('${USER_A}','${PROJECT_A}',1);`);a.send("select 'LOCK_HELD';");await a.waitFor('LOCK_HELD');
  const b=session();b.send(auth);b.send(`select public.calendar_source_revision_probe_bump('${USER_A}','${PROJECT_A}');`);b.send("select 'BUMP_FINISHED';");
  // The row is held by A; B must still be blocked while A owns the lock.
  const state=f.sql(`select count(*) from pg_stat_activity where datname='${f.database}' and wait_event_type='Lock' and query like '%calendar_source_revision_probe_bump%'`);
  // Start/connection scheduling is asynchronous, so poll rather than rely on a fixed delay.
  let blocked=state==='1';for(let i=0;i<30&&!blocked;i++){await new Promise(r=>setTimeout(r,50));blocked=f.sql(`select count(*) from pg_stat_activity where datname='${f.database}' and wait_event_type='Lock' and query like '%calendar_source_revision_probe_bump%'`)==='1';}
  expect(blocked).toBe(true);expect(b.read()).not.toContain('BUMP_FINISHED');
  a.send('commit;');a.end();const doneA=await a.closed;expect(doneA.code).toBe(0);
  b.send('commit;');b.end();const doneB=await b.closed;expect(doneB.code).toBe(0);expect(doneB.out).toContain('BUMP_FINISHED');
  expect(f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}'`)).toBe('2');
 },20000);
});
