import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A} from './test-db';

let f:ReturnType<typeof initializeCalendarDb>;
const project=(n:number)=>'10000000-0000-4000-8000-'+String(n+100).padStart(12,'0');
const workflow=(n:number)=>'50000000-0000-4000-8000-'+String(n+100).padStart(12,'0');
const stamp=(n:number)=>n<=20
 ? new Date(Date.UTC(2026,8,1,0,n)).toISOString()
 : new Date(Date.UTC(2026,7,31,0,n-20)).toISOString();
const rows=(text:string)=>text.split(/\r?\n/).filter(Boolean);
const claim=(n:number)=>f.sql('select id from public.workflow_claim_due('+n+',300)');

beforeAll(()=>{
 f=initializeCalendarDb();
 f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));
 f.sql("alter table public.projects add column execution_paused boolean not null default false;"
  +"create table public.platform_config(id integer primary key,automation_paused boolean not null default false);"
  +"insert into public.platform_config(id) values(1);"
  +"create table public.workflow_instances(id uuid primary key,project_id uuid not null references public.projects(id),"
  +"status text not null default 'active',wake_at timestamptz,last_tick_at timestamptz);");
 const ps=Array.from({length:20},(_,i)=>"('"+project(i+1)+"','"+USER_A+"')").join(',');
 const revs=Array.from({length:20},(_,i)=>"('"+USER_A+"','"+project(i+1)+"',1)").join(',');
 const jobs=Array.from({length:23},(_,i)=>{
  const n=i+1,p=n<=20?n:1;
  return "('"+workflow(n)+"','"+project(p)+"','"+stamp(n)+"')";
 }).join(',');
 f.sql('insert into public.projects(id,owner_id) values '+ps+';'
  +'insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values '+revs+';'
  +'insert into public.workflow_instances(id,project_id,wake_at) values '+jobs+';');
 for(const name of ['workflow-wake-trigger-candidate.sql','workflow-claim-due-revision-candidate.sql'])
  f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+name),'utf8'));
},60000);
beforeEach(()=>{
 const when=Array.from({length:23},(_,i)=>{
  const n=i+1;
  return "when '"+workflow(n)+"'::uuid then '"+stamp(n)+"'::timestamptz";
 }).join(' ');
 const projects=Array.from({length:20},(_,i)=>"'"+project(i+1)+"'::uuid").join(',');
 f.sql('update public.workflow_instances set wake_at=case id '+when+' end,last_tick_at=null;'
  +'update public.calendar_source_revision_probe set revision=1,last_workflow_claim_at=null '
  +'where project_id=any(array['+projects+']);');
},60000);
afterAll(()=>f?.close(),60000);

function session(){
 const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql',
  '-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',f.database]);
 let output='';
 const listeners:((value:string)=>void)[]=[];
 p.stdout.on('data',x=>{output+=x;listeners.forEach(fn=>fn(output));});
 p.stderr.on('data',x=>{output+=x;listeners.forEach(fn=>fn(output));});
 return {
  send:(sql:string)=>p.stdin.write(sql+'\n'),end:()=>p.stdin.end(),output:()=>output,
  wait:(marker:string)=>new Promise<void>((yes,no)=>{
   if(output.includes(marker))return yes();
   listeners.push(x=>{if(x.includes(marker))yes();});
   p.once('close',()=>no(Error('closed before '+marker)));
  }),
  closed:new Promise<{code:number|null;output:string}>(yes=>p.once('close',code=>yes({code,output})))
 };
}

describe('bounded per-project revision locks and fair-share across twenty due projects',()=>{
 it('does not count paused or invalid claims as a project turn',()=>{
  f.sql('update public.platform_config set automation_paused=true where id=1');
  try{
   expect(claim(1)).toBe('');
   expect(f.sql('select count(*) from public.calendar_source_revision_probe where last_workflow_claim_at is not null')).toBe('0');
  }finally{
   f.sql('update public.platform_config set automation_paused=false where id=1');
  }
  expect(()=>claim(0)).toThrow(/INVALID_CLAIM_LIMIT/);
  expect(f.sql('select count(*) from public.calendar_source_revision_probe where last_workflow_claim_at is not null')).toBe('0');
 });
 it('rotates to previously unserved projects despite a deep older backlog',()=>{
  expect([workflow(21),workflow(22),workflow(23)]).toContain(claim(1));
  expect(claim(1)).toBe(workflow(2));
  expect(claim(1)).toBe(workflow(3));
  for(const n of [1,2,3]){
   expect(f.sql("select last_workflow_claim_at is not null from public.calendar_source_revision_probe where project_id='"+project(n)+"'")).toBe('t');
  }
  expect(f.sql("select last_workflow_claim_at is null from public.calendar_source_revision_probe where project_id='"+project(4)+"'")).toBe('t');
 });
 it('keeps project twenty unlocked while sixteen project revisions are held',async()=>{
  const holder=session();holder.send('begin;');
  holder.send('select id from public.workflow_claim_due(20,300);');
  holder.send("select 'CLAIM_HELD';");await holder.wait('CLAIM_HELD');
  const external=session();external.send('begin;');
  external.send("update public.calendar_source_revision_probe set revision=revision+1 where project_id='"+project(20)+"';");
  external.send("select 'PROJECT20_FREE';");
  let completed=false;
  try{
   completed=await Promise.race([
    external.wait('PROJECT20_FREE').then(()=>true),
    new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),3000))
   ]);
   expect(completed).toBe(true);
   external.send('commit;');external.end();expect((await external.closed).code).toBe(0);
   const claimed=rows(holder.output()).filter(x=>/^[a-f0-9-]{36}$/.test(x));
   expect(claimed).toHaveLength(19);
   expect(claimed).not.toContain(workflow(20));
  }finally{
   holder.send('commit;');holder.end();expect((await holder.closed).code).toBe(0);
   if(!completed){external.send('rollback;');external.end();await external.closed;}
  }
  expect(f.sql("select revision from public.calendar_source_revision_probe where project_id='"+project(20)+"'")).toBe('2');
  expect(f.sql('select count(*) from public.workflow_instances where wake_at<=now()')).toBe('4');
 },20000);
 it('handles remaining due projects on a subsequent invocation',()=>{
  const first=rows(claim(20));
  expect(first).toHaveLength(19);
  const second=rows(claim(20));
  expect(second).toHaveLength(4);
  expect(new Set(first.concat(second)).size).toBe(23);
  expect(f.sql('select count(*) from public.workflow_instances where wake_at<=now()')).toBe('0');
 });
});
