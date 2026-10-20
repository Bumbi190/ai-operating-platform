import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{f=initializeCalendarDb();for(const file of ['source-revision-probe.sql','owner-lock-candidate.sql','batch-probe-candidate.sql','week-revision-batch-probe.sql'])f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);},60000);
afterAll(()=>f?.close(),60000);
const auth=`begin;set local role authenticated;set local "request.jwt.claim.sub"='${USER_A}';`;
function session(){const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);let output='';const callbacks:((v:string)=>void)[]=[];p.stdout.on('data',x=>{output+=x;callbacks.forEach(cb=>cb(output));});p.stderr.on('data',x=>{output+=x;callbacks.forEach(cb=>cb(output));});return {send:(s:string)=>p.stdin.write(s+'\n'),end:()=>p.stdin.end(),wait:(marker:string)=>new Promise<void>((yes,no)=>{if(output.includes(marker))return yes();callbacks.push(v=>{if(v.includes(marker))yes();});p.once('close',()=>no(Error('closed before '+marker)));}),closed:new Promise<{code:number|null;output:string}>(yes=>p.once('close',code=>yes({code,output}))),output:()=>output};}
describe('calendar batch holds external source revision row lock',()=>{
 it('blocks a concurrent version bump until batch commit',async()=>{
  const rows=JSON.stringify([{title:'Protected',startUtc:'2026-11-18T08:00:00.000Z',endUtc:'2026-11-18T09:00:00.000Z'}]);
  const holder=session();holder.send(auth);holder.send(`select public.calendar_week_revision_batch_probe('${rows}'::jsonb,'${randomUUID()}','${PROJECT_A}',1);`);holder.send("select 'BATCH_LOCKED';");await holder.wait('BATCH_LOCKED');
  const writer=session();writer.send(auth);writer.send(`select public.calendar_source_revision_probe_bump('${USER_A}','${PROJECT_A}');`);writer.send("select 'VERSION_BUMP_FINISHED';");
  let waiting=false;for(let i=0;i<40&&!waiting;i++){await new Promise(r=>setTimeout(r,50));waiting=f.sql(`select count(*) from pg_stat_activity where datname='${f.database}' and wait_event_type='Lock' and query like '%calendar_source_revision_probe_bump%'`)==='1';}
  expect(waiting).toBe(true);expect(writer.output()).not.toContain('VERSION_BUMP_FINISHED');
  holder.send('commit;');holder.end();expect((await holder.closed).code).toBe(0);
  writer.send('commit;');writer.end();expect((await writer.closed).code).toBe(0);
  expect(f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}'`)).toBe('2');
  expect(f.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`)).toBe('1');
 },20000);
});
