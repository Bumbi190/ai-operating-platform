// Standalone local-only PostgreSQL fixture. No hosted credentials, ports, mounts or pulls.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const name='omnira-calendar-responsibility-'+randomUUID();
const image='public.ecr.aws/supabase/postgres:17.11.0.004';
const label='calendar-responsibility-local';
const docker=(args,input)=>{
 const result=spawnSync('docker',args,{input,encoding:'utf8',maxBuffer:4194304});
 assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout.trim();
};
assert.match(docker(['context','inspect','--format','{{.Endpoints.docker.Host}}']),/^(npipe:\/\/|unix:\/\/)/);
docker(['image','inspect',image]);
let owned=false;
try{
 docker(['run','--pull=never','-d','--name',name,'--label','com.omnira.testplan='+label,'--network','none','-e','POSTGRES_PASSWORD=synthetic-local-only',image,'postgres','-c','shared_preload_libraries=pg_stat_statements','-c','cron.launch_active_jobs=off']);owned=true;
 let ready=false;
 for(let i=0;i<60;i++){
  const result=spawnSync('docker',['exec',name,'pg_isready','-U','postgres'],{encoding:'utf8'});
  const process=docker(['exec',name,'cat','/proc/1/comm']);
  if(result.status===0&&['postgres','.postgres-wrapp'].includes(process)){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 assert.ok(ready,'local PostgreSQL ready');
 const inspect=JSON.parse(docker(['inspect',name]))[0];
 assert.equal(inspect.HostConfig.NetworkMode,'none');assert.deepEqual(inspect.Mounts,[]);
 assert.equal(Object.keys(inspect.HostConfig.PortBindings??{}).length,0);
 docker(['exec',name,'createdb','-U','postgres','calendar_responsibility_test']);
 const sql=body=>docker(['exec','-i',name,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','calendar_responsibility_test'],body);
 const a='20000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002';
 sql(`create extension pgcrypto;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');
 create table projects(id uuid primary key,owner_id uuid references auth.users);
 create table manager_tasks(id uuid primary key,project_id uuid references projects);
 grant usage on schema public,auth to authenticated;grant select on projects,manager_tasks to authenticated;`);
 const migration=file=>sql(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 migration('20261018182213_user_calendar_v1.sql');
 migration('20261019081000_user_calendar_recurrence.sql');
 const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
 const draft={kind:'work_block',title:'Planera sagan',description:'',location:'',projectId:null,taskId:null,workStatus:'planned',time:{kind:'timed',startUtc:'2026-10-24T12:00:00.000Z',endUtc:null,timeZone:'Europe/Stockholm'}};
 const valid=value=>sql('select public.calendar_draft_valid('+literal(value)+');')==='t';
 assert.equal(valid({...draft,responsibility:'atlas_planned'}),false,'old SQL rejects new metadata (red test)');
 migration('20261024174000_user_calendar_responsibility.sql');
 assert.equal(valid(draft),true);assert.equal(valid({...draft,kind:'private',workStatus:null}),true);
 for(const responsibility of ['self','atlas_planned'])assert.equal(valid({...draft,responsibility}),true);
 for(const responsibility of [null,'worker',{},true])assert.equal(valid({...draft,responsibility}),false);
 assert.equal(valid({...draft,kind:'private',workStatus:null,responsibility:'atlas_planned'}),false);
 assert.equal(valid({...draft,responsibility:'atlas_planned',execute:true}),false);
 assert.equal(valid({...draft,responsibility:'atlas_planned',repeat:{frequency:'weekly',until:null}}),true);
 assert.equal(valid({...draft,responsibility:'self',repeat:{frequency:'weekly',until:'2026-10-01'}}),false);
 const asUser=(user,body)=>sql(`begin;set local role authenticated;set local "request.jwt.claim.sub"='${user}';${body};commit;`);
 const apply=(user,input)=>JSON.parse(asUser(user,'select public.calendar_event_apply('+literal(input)+')'));
 const create={operation:'create',eventId:randomUUID(),idempotencyKey:randomUUID(),draft:{...draft,responsibility:'atlas_planned'}};
 const receipt=apply(a,create);assert.equal(receipt.ok,true);assert.equal(receipt.event.responsibility,'atlas_planned');
 assert.deepEqual(apply(a,create),receipt,'same request replays the same receipt');
 const range={fromDate:'2026-10-19',toDateExclusive:'2026-10-26',timeZone:'Europe/Stockholm'};
 const list=user=>JSON.parse(asUser(user,'select public.calendar_event_list('+literal(range)+')'));
 assert.equal(list(a).events[0].responsibility,'atlas_planned');assert.deepEqual(list(b).events,[]);
 const update={operation:'update',eventId:create.eventId,idempotencyKey:randomUUID(),expectedVersion:1,draft:{...draft,responsibility:'self'}};
 assert.equal(apply(b,update).code,'NOT_FOUND');assert.equal(apply(a,update).event.responsibility,'self');
 assert.equal(apply(a,{...update,idempotencyKey:randomUUID()}).code,'CONFLICT');
 // Invalid metadata must fail even when bypassing the app parser and RPC.
 assert.equal(asUser(a,`do $$ begin begin update user_calendar_events set draft=draft||'{"responsibility":"worker"}'::jsonb where id='${create.eventId}';raise exception 'invalid metadata accepted';exception when check_violation then null;end;end $$;select 'invalid direct write rejected'`),'invalid direct write rejected');
 const converted=apply(a,{...update,idempotencyKey:randomUUID(),expectedVersion:2,draft:{...draft,kind:'private',workStatus:null}});
 assert.equal(converted.ok,true);assert.equal(Object.hasOwn(converted.event,'responsibility'),false);
 assert.equal(asUser(a,'select count(*) from user_calendar_events'),'1');
 console.log('PASS: old-schema rejection; old drafts; both planning values; invalid/private/execution metadata rejection; recurrence; persisted create/list/update; receipt replay; owner isolation; version conflict; direct-write constraint; private conversion.');
 console.log('Isolation: cached PostgreSQL, network none, no ports, no mounts; no worker/queue schema or execution rights added.');
}finally{
 if(owned){
  assert.equal(docker(['inspect','--format','{{index .Config.Labels "com.omnira.testplan"}}',name]),label);
  docker(['rm','-f',name]);console.log('Owned fixture removed.');
 }
}
