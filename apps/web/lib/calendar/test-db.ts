// Test-only transport: real SQL in a uniquely named, labeled local Docker fixture.
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomInt} from 'node:crypto';
import type {CalendarDb} from './types';
const container='omnira-website-build-test-20261014';
const label='atlas-live-build-20261014';
export const USER_A='20000000-0000-4000-8000-000000000001';
export const USER_B='20000000-0000-4000-8000-000000000002';
export const USER_EMPTY='20000000-0000-4000-8000-000000000003';
export const PROJECT_A='10000000-0000-4000-8000-000000000001';
export const PROJECT_B='10000000-0000-4000-8000-000000000002';
export const TASK_A='30000000-0000-4000-8000-000000000001';
export const TASK_B='30000000-0000-4000-8000-000000000002';
function docker(args:string[],input?:string):string {
 const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:4_194_304});
 if(r.status!==0)throw Error(r.stderr||r.error?.message||'Local SQL command failed');
 return r.stdout.trim();
}
function literal(value:unknown):string {return "'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";}
export function initializeCalendarDb(){
 const context=docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']);
 if(!/^(npipe:\/\/|unix:\/\/)/.test(context))throw Error('Remote Docker context refused');
 if(docker(['inspect','--format','{{index .Config.Labels "com.omnira.testplan"}}',container])!==label)throw Error('Calendar fixture ownership missing');
 const database='website_test_'+Date.now()+randomInt(1000,9999);
 if(!/^website_test_[0-9]+$/.test(database))throw Error('Unsafe fixture name');
 docker(['exec',container,'createdb','-U','postgres',database]);
 try {
 const args=['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database];
 const sql=(body:string,userId?:string)=>{
  if(userId&&!/^20000000-0000-4000-8000-00000000000[123]$/.test(userId))throw Error('Unknown fixture user');
  const auth=userId?'set local role authenticated; set local "request.jwt.claim.sub" = \''+userId+'\';':'';
  return docker(args,'begin;'+auth+body+';commit;');
 };
 sql(`create extension if not exists pgcrypto;
 create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table auth.users(id uuid primary key);
 create table public.projects(id uuid primary key,owner_id uuid not null references auth.users,name text not null default 'Testprojekt',slug text not null default 'test-project');
 create table public.manager_tasks(id uuid primary key,project_id uuid not null references projects,title text not null default 'Testuppgift',status text not null default 'pending',source text,created_at timestamptz not null default now());
 alter table public.projects enable row level security;
 create policy owner_read on public.projects for select to authenticated using(owner_id=auth.uid());
 alter table public.manager_tasks enable row level security;
 create policy owner_read on public.manager_tasks for select to authenticated using(project_id in(select id from projects where owner_id=auth.uid()));
 grant usage on schema public,auth to authenticated;
 grant select on projects,manager_tasks to authenticated;
 insert into auth.users values('${USER_A}'),('${USER_B}'),('${USER_EMPTY}');
 insert into projects(id,owner_id) values('${PROJECT_A}','${USER_A}'),('${PROJECT_B}','${USER_B}');
 insert into manager_tasks(id,project_id) values('${TASK_A}','${PROJECT_A}'),('${TASK_B}','${PROJECT_B}')`);
 const dir=resolve(process.cwd(),'supabase/migrations');
 const migrations=readdirSync(dir).filter(n=>n.endsWith('_user_calendar_v1.sql'));
 if(migrations.length>1)throw Error('Calendar migration must be unique');
 if(migrations.length)sql(readFileSync(resolve(dir,migrations[0]),'utf8'));
 const forUser=(userId:string):CalendarDb=>({
  rpc:async(name:string,params:Record<string,unknown>)=>{
   if(!['calendar_event_apply','calendar_event_list'].includes(name))throw Error('Unknown fixture RPC');
   const body='begin;set local role authenticated;set local "request.jwt.claim.sub" = \''+userId+'\';select public.'+name+'('+literal(params.p_input)+');commit;';
   return new Promise(resolveRpc=>{
    const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',error='';
    child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>error+=b);
    child.on('error',e=>resolveRpc({data:null,error:{message:e.message}}));
    child.on('exit',code=>{if(code!==0)resolveRpc({data:null,error:{message:error}});else try{resolveRpc({data:JSON.parse(out.trim()),error:null})}catch(e){resolveRpc({data:null,error:{message:String(e)}})}});
    child.stdin.end(body);
   });
  }
 } as unknown as CalendarDb);
 return {database,sql,forUser,close:()=>docker(['exec',container,'dropdb','-U','postgres','--force',database])};
 }catch(error){docker(['exec',container,'dropdb','-U','postgres','--force',database]);throw error;}
}
