import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const A='50000000-0000-4000-8000-000000000001';
const B='50000000-0000-4000-8000-000000000002';
beforeAll(()=>{
 f=initializeCalendarDb();
 for(const file of ['source-revision-probe.sql','owner-lock-candidate.sql','batch-probe-candidate.sql','week-revision-batch-probe.sql']){
   f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 }
 f.sql(`alter table public.projects add column execution_paused boolean not null default false;
 create table public.platform_config(id integer primary key,automation_paused boolean not null default false);
 insert into public.platform_config(id) values(1);
 create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),
 status text not null default 'active',wake_at timestamptz,last_tick_at timestamptz);
 insert into public.workflow_instances(id,project_id,wake_at) values
 ('${A}','${PROJECT_A}','2026-09-01T08:00:00Z'),
 ('${B}','${PROJECT_B}','2026-09-01T08:00:00Z');
 insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values
 ('${USER_A}','${PROJECT_A}',1),('${USER_B}','${PROJECT_B}',1)`);
 for(const file of ['workflow-wake-trigger-candidate.sql','workflow-claim-due-revision-candidate.sql']){
   f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));
 }
},60000);
afterAll(()=>f?.close(),60000);
function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';const listeners:((v:string)=>void)[]=[];
 p.stdout.on('data',x=>{output+=x;listeners.forEach(fn=>fn(output));});
 p.stderr.on('data',x=>{output+=x;listeners.forEach(fn=>fn(output));});
 return {send:(sql:string)=>p.stdin.write(sql+'\n'),end:()=>p.stdin.end(),output:()=>output,
  wait:(marker:string)=>new Promise<void>((resolve,reject)=>{if(output.includes(marker))return resolve();listeners.push(s=>{if(s.includes(marker))resolve();});p.once('close',()=>reject(Error('session closed before '+marker)));}),
  closed:new Promise<{code:number|null;output:string}>(resolve=>p.once('close',code=>resolve({code,output})))};
}
describe('isolated real batch approval vs workflow claim_due',()=>{
 it('keeps batch source lock while background worker skips that project and claims another',async()=>{
   const payload=JSON.stringify([{title:'Approved work block',startUtc:'2026-11-18T08:00:00.000Z',endUtc:'2026-11-18T09:00:00.000Z'}]);
   const batch=session();batch.send('begin;');batch.send(`set local role authenticated;set local "request.jwt.claim.sub"='${USER_A}';`);
   batch.send(`select public.calendar_week_revision_batch_probe('${payload}'::jsonb,'${randomUUID()}','${PROJECT_A}',1);`);
   batch.send("select 'BATCH_LOCK_HELD';");await batch.wait('BATCH_LOCK_HELD');
   const worker=session();worker.send('begin;set local role service_role;');worker.send('select id from public.workflow_claim_due(20,300);');worker.send("select 'CLAIM_COMPLETE';");
   let completed=false;
   try{
     completed=await Promise.race([worker.wait('CLAIM_COMPLETE').then(()=>true),new Promise<boolean>(done=>setTimeout(()=>done(false),4500))]);
     expect(completed).toBe(true);
     expect(worker.output()).toContain(B);
     expect(worker.output()).not.toContain(A);
     worker.send('commit;');worker.end();expect((await worker.closed).code).toBe(0);
     expect(f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}'`)).toBe('1');
     expect(f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_B}'`)).toBe('2');
     expect(f.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`)).toBe('0');
   }finally{
     batch.send('commit;');batch.end();expect((await batch.closed).code).toBe(0);
     if(!completed){worker.send('rollback;');worker.end();await worker.closed;}
   }
   expect(f.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`)).toBe('1');
   expect(f.sql(`select wake_at from public.workflow_instances where id='${A}'`)).toContain('2026-09-01');
   expect(Date.parse(f.sql(`select wake_at from public.workflow_instances where id='${B}'`))).toBeGreaterThan(Date.now());
 },20000);
});
