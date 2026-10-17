// Isolated synthetic PostgreSQL proof. No host ports, network, production DB or provider calls.
import fs from 'node:fs';import cp from 'node:child_process';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const name='omnira-hb-watch-runs-test-'+process.pid+'-'+Date.now(),image='public.ecr.aws/supabase/postgres:17.6.1.095';
const sourcePath=path.join(root,'docs/sql/handlarborsen_watch_runs_p1_proposed.sql');
const source=fs.existsSync(sourcePath)?fs.readFileSync(sourcePath,'utf8'):null;
const receipt={image,productionAccess:false,providerCalls:0,checks:[],sourceSha256:source?crypto.createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex'):null};
function docker(args,input,allowFailure=false){const result=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:30000,windowsHide:true});if(result.status!==0&&!allowFailure)throw Error((result.stderr||result.error?.message||result.stdout||'docker failed').slice(-3500));return result;}
const args=['exec','-i',name,'psql','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-Atq'];
const sql=(query,allowFailure=false)=>docker(args,query,allowFailure);
function concurrent(query){return new Promise((resolve,reject)=>{const proc=cp.spawn('docker',args,{windowsHide:true});let stdout='',stderr='';proc.stdout.on('data',v=>stdout+=v);proc.stderr.on('data',v=>stderr+=v);proc.on('error',reject);proc.on('close',code=>code===0?resolve(stdout.trim()):reject(Error(stderr.slice(-2000))));proc.stdin.end(query);});}
(async()=>{let created=false;try{
 docker(['image','inspect',image]); // Never silently download an image.
 assert.equal(docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).stdout.trim(),'');
 docker(['run','-d','--name',name,'--network','none','--label','com.omnira.workstream=hb-watch-runs-p1','--entrypoint','bash',image,'-lc','mkdir /tmp/hbdata && chown postgres:postgres /tmp/hbdata && gosu postgres initdb -D /tmp/hbdata -A trust -U postgres >/tmp/hb-init.log && exec gosu postgres postgres -D /tmp/hbdata -k /tmp -c listen_addresses=']);created=true;
 let ready=false;for(let n=0;n<30;n++){if(docker(['exec',name,'pg_isready','-h','/tmp','-U','postgres'],undefined,true).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert(ready,'fixture DB not ready');
 receipt.version=sql('select version();').stdout.trim();
 sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 grant usage on schema public to anon,authenticated,service_role;
 create table public.projects(id uuid primary key,owner_id uuid not null,slug text not null);
 insert into projects values('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','11111111-1111-4111-8111-111111111111','handlarborsen');
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;`);
 if(source)sql(source);
 sql(fs.readFileSync(path.join(root,'docs/sql/handlarborsen_watch_runs_p1_fixture.sql'),'utf8'));
 receipt.checks.push('RLS+FORCE with zero policies/client table+column privileges','three scoped definers, hardened helpers','enqueue/claim/finish idempotency and CAS','terminal mismatch refuses','expired worker in pre-expiry transaction stays uncertain','cross-period running+uncertain exclusivity','append-only audit and immutable identity','bounded completion metadata');
 const p="'8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid",week="date_trunc('week',clock_timestamp() at time zone 'Europe/Stockholm')::date";
 const denied=[
 ['anon read','set role anon;select * from public.handlarborsen_watch_runs;'],
 ['authenticated read','set role authenticated;select * from public.handlarborsen_watch_run_events;'],
 ['service insert',`set role service_role;insert into public.handlarborsen_watch_runs(project_id,period_start) values(${p},${week});`],
 ['service update',"set role service_role;update public.handlarborsen_watch_runs set status='failed';"],
 ['service delete','set role service_role;delete from public.handlarborsen_watch_run_events;'],
 ['service truncate','set role service_role;truncate public.handlarborsen_watch_runs;'],
 ['client enqueue',`set role authenticated;select public.handlarborsen_watch_enqueue_v1(${p},${week});`],
 ['client claim',`set role anon;select public.handlarborsen_watch_claim_v1(${p},gen_random_uuid(),gen_random_uuid(),180);`],
 ['client finish',`set role authenticated;select public.handlarborsen_watch_finish_v1(${p},gen_random_uuid(),gen_random_uuid(),1,'failed','gate_refused',0,null);`],
 ];
 for(const[label,query]of denied){const result=sql(query,true);assert.notEqual(result.status,0,label+' unexpectedly allowed');assert.match(result.stderr,/permission denied/,label);receipt.checks.push(label+' denied');}
 const enqueue=`set role service_role;select public.handlarborsen_watch_enqueue_v1(${p},${week});`;
 const queued=await Promise.all(Array.from({length:4},()=>concurrent(enqueue)));
 const entries=queued.map(text=>JSON.parse(text));assert.equal(entries.filter(r=>r.outcome==='queued').length,1);assert.equal(new Set(entries.map(r=>r.run.id)).size,1);
 const id=entries[0].run.id,tokens=[crypto.randomUUID(),crypto.randomUUID()];

 const queuedBlocker=concurrent("set application_name='hb_watch_claim_lock_fixture';begin;select id from public.handlarborsen_watch_runs where id='"+id+"' for update;select pg_sleep(6);commit;");
 let queuedLocked=false;for(let attempt=0;attempt<12;attempt++){if(sql("select count(*) from pg_stat_activity where application_name='hb_watch_claim_lock_fixture' and wait_event='PgSleep';").stdout.trim()==='1'){queuedLocked=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}
 assert(queuedLocked,'queued row lock not acquired');
 const claimed=await Promise.all(tokens.map(token=>concurrent(`set role service_role;select public.handlarborsen_watch_claim_v1(${p},'${id}','${token}',5);`)));
 assert.deepEqual(claimed.map(text=>JSON.parse(text).outcome).sort(),['already_running','claimed']);
 await queuedBlocker;
 assert.equal(sql("select lease_until>clock_timestamp()+interval '2 seconds' from public.handlarborsen_watch_runs where id='"+id+"';").stdout.trim(),'t','a queued row lock must not consume the newly granted lease');
 receipt.checks.push('claim lease starts after queued row lock release');

 assert.equal(sql('set role service_role;select count(*) from public.handlarborsen_watch_run_events;').stdout.trim(),'2');
 receipt.checks.push('four simultaneous service enqueues create one row/event','two simultaneous service claims create one claim/event');
 const winner=tokens[claimed.findIndex(text=>JSON.parse(text).outcome==='claimed')];
 const blocker=concurrent("set application_name='hb_watch_row_lock_fixture';begin;select id from public.handlarborsen_watch_runs where id='"+id+"' for update;select pg_sleep(6);commit;");
 let locked=false;for(let attempt=0;attempt<12;attempt++){if(sql("select count(*) from pg_stat_activity where application_name='hb_watch_row_lock_fixture' and wait_event='PgSleep';").stdout.trim()==='1'){locked=true;break;}await new Promise(resolve=>setTimeout(resolve,25));}
 assert(locked,'row lock not acquired');
 assert.equal(sql("select lease_until>clock_timestamp()+interval '1 second' from public.handlarborsen_watch_runs where id='"+id+"';").stdout.trim(),'t','lease must still be live before waiting');
 const waitingFinish=concurrent("set role service_role;select public.handlarborsen_watch_finish_v1("+p+",'"+id+"','"+winner+"',1,'succeeded','verified',1,repeat('c',64));");
 const lockedResults=await Promise.all([blocker,waitingFinish]);
 assert.equal(JSON.parse(lockedResults[1]).outcome,'uncertain','a row-lock wait must not reuse a pre-wait clock');
 receipt.checks.push('row-lock wait crossing expiry cannot complete with stale time');

 receipt.status='passed';
}finally{if(created){docker(['rm','-f',name]);receipt.containerRemoved=true;}receipt.finishedAt=new Date().toISOString();if(process.env.HB_WATCH_RUNS_TEST_RECEIPT)fs.writeFileSync(process.env.HB_WATCH_RUNS_TEST_RECEIPT,JSON.stringify(receipt,null,2)+'\n');}
console.log(JSON.stringify(receipt));})().catch(error=>{console.error(error.message);process.exitCode=1;});
