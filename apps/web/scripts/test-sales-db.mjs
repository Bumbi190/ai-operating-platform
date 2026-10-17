import {spawnSync,spawn} from 'node:child_process'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
const root=resolve(import.meta.dirname,'../../..'),container='omnira-sales-pilot-20261017'
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:2e6});if(r.status!==0)throw Error((r.stderr||r.stdout||String(r.error)).slice(-8000));return r.stdout}
const context=docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']).trim()
if(!/^(npipe:\/\/|unix:\/\/)/.test(context))throw Error('Remote Docker refused')
if(docker(['inspect','--format','{{.Config.Image}}',container]).trim()!=='postgres:16')throw Error('Unexpected fixture container')
const db='sales_'+Date.now();docker(['exec',container,'createdb','-U','postgres',db])
const sql=s=>docker(['exec','-i',container,'psql','-X','-q','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],s)
try{
 sql(`create schema extensions; create extension pgcrypto with schema extensions; do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table auth.users(id uuid primary key); create table projects(id uuid primary key,owner_id uuid not null,slug text not null,execution_paused boolean not null default false);
 create table conversations(id uuid primary key,user_id uuid not null,project_id uuid);
 create table platform_config(id integer primary key,automation_paused boolean); insert into platform_config values(1,false);
 create table runs(id uuid primary key default gen_random_uuid(),project_id uuid not null,workflow_id uuid,kind text,status text not null,input jsonb default '{}',context jsonb default '{}',policy_class text,error text,created_at timestamptz default now());
 create table approvals(id uuid primary key default gen_random_uuid(),project_id uuid,run_id uuid,status text,kind text,output_key text,content text,reviewer_notes text,reviewed_at timestamptz,created_at timestamptz default now());
 grant usage on schema public,auth to authenticated,service_role; grant select on projects to authenticated; grant all on all tables in schema public to service_role;
 insert into auth.users values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
 insert into projects values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','handlarborsen',false),('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','other',false);
 insert into conversations values('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');`)
 const source=readFileSync(resolve(root,'apps/web/supabase/migrations/20260903120000_durable_cancellation_reaper.sql'),'utf8'),start=source.indexOf('create or replace function public.resolve_approval('),end=source.indexOf('$fn$;',start)+6
 sql(source.slice(start,end))
 const migrations=resolve(root,'apps/web/supabase/migrations'),file=readdirSync(migrations).find(x=>x.endsWith('_atlas_sales_pilot.sql'))
 if(file)sql(readFileSync(resolve(migrations,file),'utf8'))
 console.log(sql(readFileSync(resolve(root,'apps/web/supabase/tests/sales_pilot.sql'),'utf8')))
 sql(`update sales_contacts set data=data||'{"history":"not_contacted"}'; select sales_enroll_worker('{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}',jsonb_build_object('projectId','10000000-0000-4000-8000-000000000001','workerId',gen_random_uuid(),'tokenHash',repeat('b',64))); select sales_prepare_job('{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}','{"projectId":"10000000-0000-4000-8000-000000000001","conversationId":"50000000-0000-4000-8000-000000000001","contactIds":["30000000-0000-4000-8000-000000000001"],"offerRevisionId":"40000000-0000-4000-8000-000000000001","idempotencyKey":"race"}');`)
 const claim=()=>new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>code===0?resolve(JSON.parse(out.trim())):reject(Error(err)));p.stdin.end("select sales_claim_job(repeat('b',64),'{}');")})
 const claims=await Promise.all([claim(),claim()]);if(claims.filter(c=>c.ref!==null).length!==1)throw Error('TEST FAILED: concurrent claims did not produce one owner')
 console.log('PASS: real PostgreSQL sales transactions, concurrent claim and canonical approval integration')
}finally{docker(['exec',container,'dropdb','-U','postgres',db])}
