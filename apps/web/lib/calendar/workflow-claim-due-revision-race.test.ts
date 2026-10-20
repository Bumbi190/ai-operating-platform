import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A,PROJECT_B} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
const A='50000000-0000-4000-8000-000000000001';
const B='50000000-0000-4000-8000-000000000002';
const due='2026-09-01T08:00:00Z';
const claim='select id from public.workflow_claim_due(20,300);';
const revision=(owner:string,project:string)=>f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${owner}' and project_id='${project}'`);
const wake=(id:string)=>f.sql(`select wake_at from public.workflow_instances where id='${id}'`);
beforeAll(()=>{
 f=initializeCalendarDb();
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));
 f.sql(`alter table public.projects add column execution_paused boolean not null default false;
 create table public.platform_config(id integer primary key,automation_paused boolean not null default false);
 insert into public.platform_config(id) values(1);
 create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),
 status text not null default 'active',wake_at timestamptz,last_tick_at timestamptz);
 insert into public.workflow_instances(id,project_id,wake_at) values
 ('${A}','${PROJECT_A}','${due}'),('${B}','${PROJECT_B}','${due}');
 insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values
 ('${USER_A}','${PROJECT_A}',1),('${USER_B}','${PROJECT_B}',1)`);
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-wake-trigger-candidate.sql'),'utf8'));
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/workflow-claim-due-revision-candidate.sql'),'utf8'));
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
describe('claim_due skip and stop behavior under held source/version transactions',()=>{
 it('skips a busy source revision and claims the due job for an independent project',async()=>{
   const holder=session();holder.send('begin;');
   holder.send(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}' for update;`);
   holder.send("select 'SOURCE_A_HELD';");await holder.wait('SOURCE_A_HELD');
   const worker=session();worker.send('begin;set local role service_role;');worker.send(claim);worker.send("select 'CLAIM_COMPLETE';");
   let wasReady=false;
   try {
     wasReady=await Promise.race([worker.wait('CLAIM_COMPLETE').then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),4500))]);
     expect(wasReady).toBe(true);
     expect(worker.output()).toContain(B);
     expect(worker.output()).not.toContain(A);
     worker.send('commit;');worker.end();expect((await worker.closed).code).toBe(0);
     expect(revision(USER_A,PROJECT_A)).toBe('1');
     expect(wake(A)).toContain('2026-09-01');
     expect(revision(USER_B,PROJECT_B)).toBe('2');
   }finally{
     holder.send('commit;');holder.end();
     expect((await holder.closed).code).toBe(0);
     if(!wasReady){worker.send('rollback;');worker.end();await worker.closed;}
   }
 },20000);
 it('honors a concurrent global pause before any wake or revision changes',async()=>{
   const pauser=session();pauser.send('begin;');
   pauser.send('update public.platform_config set automation_paused=true where id=1;');
   pauser.send("select 'PAUSE_WRITER_HELD';");await pauser.wait('PAUSE_WRITER_HELD');
   const worker=session();worker.send('begin;set local role service_role;');worker.send(claim);worker.send("select 'CLAIM_COMPLETE';");
   let waiting=false;
   for(let i=0;i<30&&!waiting;i++){
     await new Promise(resolve=>setTimeout(resolve,60));
     waiting=f.sql(`select count(*) from pg_stat_activity where datname='${f.database}' and wait_event_type='Lock' and query like '%workflow_claim_due%'`)==='1';
   }
   try{
     expect(waiting).toBe(true);
     expect(worker.output()).not.toContain('CLAIM_COMPLETE');
   }finally{
     pauser.send('commit;');pauser.end();expect((await pauser.closed).code).toBe(0);
     worker.send('commit;');worker.end();
     const finished=await worker.closed;
     expect(finished.code).toBe(0);
     expect(finished.output).toContain('CLAIM_COMPLETE');
   }
   expect(wake(A)).toContain('2026-09-01');
   expect(revision(USER_A,PROJECT_A)).toBe('1');
 },20000);
 it('honors a concurrent project pause after the workflow row is selected',async()=>{
   f.sql('update public.platform_config set automation_paused=false where id=1');
   const pauser=session();pauser.send('begin;');
   pauser.send(`update public.projects set execution_paused=true where id='${PROJECT_A}';`);
   pauser.send("select 'PROJECT_PAUSE_HELD';");await pauser.wait('PROJECT_PAUSE_HELD');
   const worker=session();worker.send('begin;set local role service_role;');worker.send(claim);worker.send("select 'CLAIM_COMPLETE';");
   let waiting=false;
   for(let i=0;i<30&&!waiting;i++){
     await new Promise(resolve=>setTimeout(resolve,60));
     waiting=f.sql(`select count(*) from pg_stat_activity where datname='${f.database}' and wait_event_type='Lock' and query like '%workflow_claim_due%'`)==='1';
   }
   try{
     expect(waiting).toBe(true);
     expect(worker.output()).not.toContain('CLAIM_COMPLETE');
   }finally{
     pauser.send('commit;');pauser.end();expect((await pauser.closed).code).toBe(0);
     worker.send('commit;');worker.end();
     const finished=await worker.closed;
     expect(finished.code).toBe(0);
     expect(finished.output).toContain('CLAIM_COMPLETE');
   }
   expect(wake(A)).toContain('2026-09-01');
   expect(revision(USER_A,PROJECT_A)).toBe('1');
 },20000);

 it('preserves FOR UPDATE SKIP LOCKED when another worker holds the instance row',async()=>{
   f.sql(`update public.projects set execution_paused=false where id='${PROJECT_A}'`);
   const holder=session();holder.send('begin;');
   holder.send(`select id from public.workflow_instances where id='${A}' for update;`);
   holder.send("select 'INSTANCE_ROW_HELD';");await holder.wait('INSTANCE_ROW_HELD');
   const worker=session();worker.send('begin;set local role service_role;');worker.send(claim);worker.send("select 'CLAIM_COMPLETE';");
   let completed=false;
   try{
     completed=await Promise.race([worker.wait('CLAIM_COMPLETE').then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),4500))]);
     expect(completed).toBe(true);
     expect(worker.output()).not.toContain(A);
     expect(worker.output()).not.toContain(B);
     worker.send('commit;');worker.end();expect((await worker.closed).code).toBe(0);
     expect(wake(A)).toContain('2026-09-01');
     expect(revision(USER_A,PROJECT_A)).toBe('1');
   }finally{
     holder.send('commit;');holder.end();expect((await holder.closed).code).toBe(0);
     if(!completed){worker.send('rollback;');worker.end();await worker.closed;}
   }
 },20000);

});
