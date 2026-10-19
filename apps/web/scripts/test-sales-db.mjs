import {sendSourceRaces} from './test-sales-send-source-races.mjs'
import {sendDispatchRaces} from './test-sales-send-races.mjs'
import {replyReviewRaces} from './test-sales-reply-races.mjs'
import {spawnSync,spawn} from 'node:child_process'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {generateKeyPairSync,createHash} from 'node:crypto'
const root=resolve(import.meta.dirname,'../../..'),container=process.env.SALES_FIXTURE_CONTAINER??'omnira-sales-pilot-20261017'
const owned={'omnira-sales-pilot-20261017':'atlas-sales-pilot-20261017','omnira-sales-reply-20261018':'atlas-sales-reply-20261018','omnira-sales-sending-20261018':'atlas-sales-sending-20261018'}
if(!Object.hasOwn(owned,container))throw Error('Unowned fixture container refused')
function docker(args,input){const r=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:2e6});if(r.status!==0)throw Error((r.stderr||r.stdout||String(r.error)).slice(-8000));return r.stdout}
const context=docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']).trim()
if(!/^(npipe:\/\/|unix:\/\/)/.test(context))throw Error('Remote Docker refused')
if(docker(['inspect','--format','{{.Config.Image}}',container]).trim()!=='postgres:16')throw Error('Unexpected fixture container')
if(docker(['inspect','--format','{{index .Config.Labels "com.omnira.testplan"}}',container]).trim()!==owned[container])throw Error('Fixture ownership label missing')
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
 grant usage on schema extensions to service_role; grant usage on schema public,auth to authenticated,service_role; grant select on projects to authenticated; grant all on all tables in schema public to service_role;
 insert into auth.users values('20000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
 insert into projects values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','handlarborsen',false),('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','other',false);
 insert into conversations values('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');`)
 const source=readFileSync(resolve(root,'apps/web/supabase/migrations/20260903120000_durable_cancellation_reaper.sql'),'utf8'),start=source.indexOf('create or replace function public.resolve_approval('),end=source.indexOf('$fn$;',start)+6
 sql('alter table runs add column idempotency_key text unique, add column workflow_instance_id uuid, add column workflow_def_hash text, add column workflow_from_state text, add column action_kind text, add column action_class text, add column target_version_hash text, add column authorization_id uuid, add column attempt_group uuid, add column authorized_at timestamptz;')
 for(const [file,name] of [['20260830_workflow_action_binding.sql','runs_idempotency_key_sha256'],['20260830_readonly_action_authorization.sql','runs_action_binding_complete']]){
  const canonical=readFileSync(resolve(root,'apps/web/supabase/migrations',file),'utf8'),from=canonical.indexOf('alter table public.runs add constraint '+name+' check ('),until=canonical.indexOf(');',from)+2
  if(from<0||until<from)throw Error('Canonical constraint missing: '+name)
  sql(canonical.slice(from,until))
 }
 sql(source.slice(start,end))
 const migrations=resolve(root,'apps/web/supabase/migrations'),file=readdirSync(migrations).find(x=>x.endsWith('_atlas_sales_pilot.sql'))
 if(file)sql(readFileSync(resolve(migrations,file),'utf8'))
 console.log(sql(readFileSync(resolve(root,'apps/web/supabase/tests/sales_pilot.sql'),'utf8')))
 console.log(sql(readFileSync(resolve(root,'apps/web/supabase/tests/sales_pilot_regressions.sql'),'utf8')))
 const hostMigration=resolve(migrations,'20261017141000_sales_managed_host.sql');if(readdirSync(migrations).includes('20261017141000_sales_managed_host.sql'))sql(readFileSync(hostMigration,'utf8'))
 console.log(sql(readFileSync(resolve(root,'apps/web/supabase/tests/sales_managed_host.sql'),'utf8')))
 // Local cron fixture records only our cleanup registration; no scheduler/network exists.
 sql(`create schema cron; create table cron.job(jobid bigserial primary key,jobname text unique,schedule text,command text,active boolean default true,database text default current_database(),username text default current_user); create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid $$;`)
 const mailboxMigration='20261017142000_sales_strato_connection.sql';if(readdirSync(migrations).includes(mailboxMigration))sql(readFileSync(resolve(migrations,mailboxMigration),'utf8'))
 const {publicKey}=generateKeyPairSync('rsa',{modulusLength:3072,publicExponent:65537}),pub={jwk:publicKey.export({format:'jwk'}),kid:createHash('sha256').update(publicKey.export({format:'der',type:'spki'})).digest('hex')};
 const {publicKey:altKey}=generateKeyPairSync('rsa',{modulusLength:3072,publicExponent:65537}),alt={jwk:altKey.export({format:'jwk'}),kid:createHash('sha256').update(altKey.export({format:'der',type:'spki'})).digest('hex')};
 console.log(sql(`select set_config('sales.mailbox_public_key','${JSON.stringify(pub).replaceAll("'","''")}',false);select set_config('sales.mailbox_public_key_alt','${JSON.stringify(alt).replaceAll("'","''")}',false);`+readFileSync(resolve(root,'apps/web/supabase/tests/sales_strato_connection.sql'),'utf8')))

 const inboxMigration='20261017191904_sales_strato_inbox.sql';sql(readFileSync(resolve(migrations,inboxMigration),'utf8'))
 console.log(sql(readFileSync(resolve(root,'apps/web/supabase/tests/sales_strato_inbox.sql'),'utf8')))
 const replyMigration=readdirSync(migrations).filter(x=>x.endsWith('_sales_reply_preparation.sql'));if(replyMigration.length!==1)throw Error('Expected one reply migration');sql(readFileSync(resolve(migrations,replyMigration[0]),'utf8'));console.log(sql(readFileSync(resolve(root,'apps/web/supabase/tests/sales_replies.sql'),'utf8')))

 if(container==='omnira-sales-sending-20261018')sql('alter default privileges for role postgres in schema public grant usage,select,update on sequences to anon,authenticated;');
 const sendFiles=readdirSync(migrations).filter(x=>x.endsWith('_sales_reply_sending.sql'));
 for(const file of sendFiles)sql(readFileSync(resolve(migrations,file),'utf8'));
 console.log(sql(readFileSync(resolve(root,'apps/web/supabase/tests/sales_sending.sql'),'utf8')));
 const timingFiles=readdirSync(migrations).filter(x=>x.endsWith('_sales_contact_timing.sql'));
 if(timingFiles.length>1)throw Error('Expected one timing migration');
 for(const file of timingFiles)sql(readFileSync(resolve(migrations,file),'utf8'));
 console.log(sql(readFileSync(resolve(root,'apps/web/supabase/tests/sales_contact_timing.sql'),'utf8')));


 if(process.env.SALES_TIMING_SQL_ONLY!=='1'){
 sql(`select sales_enroll_worker('{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}','{"projectId":"10000000-0000-4000-8000-000000000001","workerId":"60000000-0000-4000-8000-000000000098","tokenHash":"${'1'.repeat(64)}"}'); select sales_host_authorize('{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}','{"projectId":"10000000-0000-4000-8000-000000000001","workerId":"60000000-0000-4000-8000-000000000098"}'); select sales_host_adopt(repeat('1',64),jsonb_build_object('managerTokenHash',repeat('2',64)));`)
 const rotateRace=(id,hash)=>new Promise((done,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>done({code,out,err}));p.stdin.end(`select sales_host_rotate(repeat('2',64),jsonb_build_object('rotationId','${id}','newTokenHash',repeat('${hash}',64),'expectedGeneration',1));`)})
 const rotations=await Promise.all([rotateRace('70000000-0000-4000-8000-000000000098','3'),rotateRace('70000000-0000-4000-8000-000000000099','4')]);
 if(rotations.filter(x=>x.code===0).length!==1||rotations.filter(x=>x.err.includes('FENCED')).length!==1)throw Error('TEST FAILED: concurrent rotation must have one winner');
 console.log('PASS: concurrent rotations have exactly one winner; stale generation fenced')

 sql(`insert into sales_contacts select '30000000-0000-4000-8000-000000000004',project_id,1,data||'{"id":"30000000-0000-4000-8000-000000000004","email":"race@example.se"}',now() from sales_contacts where id='30000000-0000-4000-8000-000000000001'; select sales_enroll_worker('{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}',jsonb_build_object('projectId','10000000-0000-4000-8000-000000000001','workerId',gen_random_uuid(),'tokenHash',repeat('b',64))); select sales_prepare_job('{"userId":"20000000-0000-4000-8000-000000000001","allowedProjectIds":["10000000-0000-4000-8000-000000000001"]}','{"projectId":"10000000-0000-4000-8000-000000000001","conversationId":"50000000-0000-4000-8000-000000000001","contactIds":["30000000-0000-4000-8000-000000000004"],"offerRevisionId":"40000000-0000-4000-8000-000000000001","idempotencyKey":"race"}');`)
 const claim=()=>new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]);let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>code===0?resolve(JSON.parse(out.trim())):reject(Error(err)));p.stdin.end("select sales_claim_job(repeat('b',64),'{}');")})
 const claims=await Promise.all([claim(),claim()]);if(claims.filter(c=>c.ref!==null).length!==1)throw Error('TEST FAILED: concurrent claims did not produce one owner')
 const psql=['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]
 const fixture=JSON.parse(docker(psql,"select sales_regression_fixture('concurrent-prepare');"))
 const enqueue=key=>new Promise((resolveRace,reject)=>{const child=spawn('docker',psql);let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('close',code=>resolveRace({code,out,err}));const principal=JSON.stringify(fixture.principal).replaceAll("'","''"),input=JSON.stringify({...fixture.input,idempotencyKey:key}).replaceAll("'","''");child.stdin.end(`select sales_prepare_job('${principal}','${input}');`)})
 const requests=await Promise.all([enqueue('race-a'),enqueue('race-b')]);if(requests.filter(x=>x.code===0).length!==1||requests.filter(x=>x.err.includes('INITIAL_JOB_ALREADY_EXISTS')).length!==1)throw Error('TEST FAILED: concurrent initial requests both accepted')
 console.log('PASS: concurrent different-key requests produce exactly one initial mailbox job')
 console.log('PASS: real PostgreSQL sales transactions, concurrent claim and canonical approval integration')
 const tests=readFileSync(resolve(root,'apps/web/supabase/tests/sales_replies.sql'),'utf8');
 sql(tests.split('set local role service_role;')[0]+'commit;');
 const principal=JSON.parse(tests.match(/declare p jsonb:='([^']+)'/)[1]),input=JSON.parse(tests.match(/;v jsonb:='([^']+)'/)[1]);
 const quote=v=>"'"+JSON.stringify(v).replaceAll("'","''")+"'::jsonb";
 const concurrent=statement=>new Promise((done,reject)=>{const child=spawn('docker',['exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',db]);let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.on('error',reject);child.on('close',code=>done({code,out,err}));child.stdin.end('set role service_role;'+statement);});
 const results=await Promise.all(Array.from({length:3},()=>concurrent('select sales_reply_prepare('+quote(principal)+','+quote(input)+');')));
 if(results.some(x=>x.code!==0)||new Set(results.map(x=>JSON.parse(x.out).id)).size!==1)throw Error('REPLY_DUPLICATE_REQUEST_RACE_FAILED');
 const claimResult=await concurrent("select sales_reply_claim(repeat('8',64),'{}');");if(claimResult.code!==0)throw Error(claimResult.err);const claimed=JSON.parse(claimResult.out);
 const attempts=await Promise.all(Array.from({length:15},()=>concurrent("select sales_reply_reserve_attempt(repeat('8',64),"+quote({...claimed.ref,attemptId:crypto.randomUUID()})+');')));
 if(attempts.filter(x=>x.code===0).length!==10||attempts.filter(x=>x.err.includes('ATTEMPT_LIMIT')).length!==5)throw Error('REPLY_ATOMIC_ATTEMPT_RACE_FAILED');
 console.log('PASS: concurrent duplicate requests -> one job; fifteen parallel reservations -> ten accepted/five refused');

 await sendDispatchRaces({root,sql,run:concurrent});
 await sendSourceRaces({container,db,sql,run:concurrent});
 await replyReviewRaces({container,db,run:concurrent,principal,input,claimed});
 const integration=spawnSync(process.execPath,[resolve(root,'node_modules/vitest/vitest.mjs'),'run','lib/qa/sales-integration.test.ts','lib/qa/sales-host-integration.test.ts','lib/qa/sales-mailbox-integration.test.ts','lib/qa/sales-inbox-integration.test.ts','lib/qa/sales-reply-integration.test.ts',...(container==='omnira-sales-sending-20261018'?['lib/qa/sales-send-integration.test.ts']:[]),'--maxWorkers=1','--minWorkers=1'],{cwd:resolve(root,'apps/web'),env:{...process.env,SALES_FIXTURE_DATABASE:db,SALES_FIXTURE_CONTAINER:container},encoding:'utf8',maxBuffer:2e6})
 console.log(integration.stdout);if(integration.status!==0)throw Error(integration.stderr||'Sales slice integration failed')
 }
}finally{docker(['exec',container,'dropdb','-U','postgres',db])}
