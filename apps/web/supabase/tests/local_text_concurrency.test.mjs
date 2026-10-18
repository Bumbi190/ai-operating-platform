import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync,spawn} from 'node:child_process';import path from 'node:path';import {fileURLToPath} from 'node:url';
const container=process.env.LOCAL_TEXT_TEST_CONTAINER,db=process.env.LOCAL_TEXT_TEST_DATABASE;
function sql(text){const r=spawnSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],{input:text,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout;}
test('two independent SQL sessions cannot claim two GPU jobs on the same device',{skip:!container||!db},async()=>{
 assert.match(container,/^omnira-atlas-local-text-test-[0-9]{8}$/);assert.match(db,/^local_text_task[0-9]+_[a-z0-9_]+$/);
 const owner=spawnSync('docker',['inspect',container,'--format','{{index .Config.Labels "com.omnira.workstream"}}'],{encoding:'utf8'});assert.equal(owner.status,0,owner.stderr);assert.equal(owner.stdout.trim(),'atlas-local-text-integration-20261017');
 const test=readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'local_text.sql'),'utf8');sql(test.replace(/rollback;\s*$/i,'commit;'));
 sql(`begin;delete from public.local_text_attempts;update public.local_text_jobs set state='queued',attempt_id=null,claim_id=null,device_id=null,fence=0,lease_until=null;update public.local_text_devices set last_heartbeat_at=clock_timestamp();
 insert into public.local_text_selections(id,job_id,decision) select 'ffffffff-ffff-4fff-8fff-ffffffffffff',job_id,jsonb_set(jsonb_set(decision,'{id}','"ffffffff-ffff-4fff-8fff-ffffffffffff"'),'{validUntil}',to_jsonb(clock_timestamp()+interval '5 minutes')) from public.local_text_selections limit 1;
 update public.local_text_jobs set selection_id='ffffffff-ffff-4fff-8fff-ffffffffffff';
 insert into public.local_text_jobs(id,project_id,owner_id,conversation_id,idempotency_key,input_hash,task_kind,task,context,admission_id,expires_at,payload_expires_at) select '12345678-1234-4234-8234-123456789abc',project_id,owner_id,conversation_id,'12345678-1234-4234-8234-123456789abc',input_hash,task_kind,task,context,admission_id,expires_at,payload_expires_at from public.local_text_jobs limit 1;
 insert into public.local_text_selections(id,job_id,decision) select '12345678-1234-4234-8234-123456789abd','12345678-1234-4234-8234-123456789abc',jsonb_set(jsonb_set(decision,'{id}','"12345678-1234-4234-8234-123456789abd"'),'{jobId}','"12345678-1234-4234-8234-123456789abc"') from public.local_text_selections where id='ffffffff-ffff-4fff-8fff-ffffffffffff';
 update public.local_text_jobs set selection_id='12345678-1234-4234-8234-123456789abd' where id='12345678-1234-4234-8234-123456789abc';commit;`);
 const call=()=>new Promise((resolve,reject)=>{const p=spawn('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']);let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',c=>c===0?resolve(out):reject(Error(err)));p.stdin.end("begin;set local role service_role;select public.local_text_claim('55555555-5555-4555-8555-555555555555');select pg_sleep(0.5);commit;");});
 const replies=(await Promise.all([call(),call()])).map(s=>JSON.parse(s.split(/\r?\n/).find(l=>l.startsWith('{'))));
 assert.equal(replies.filter(r=>r.kind==='applied'&&r.value!==null).length,1);assert.equal(replies.filter(r=>r.kind==='applied'&&r.value===null).length,1);
 assert.equal(sql("select count(*) from public.local_text_attempts where state='claimed';").trim(),'1');
});

test('two signed-operation transactions with one counter accept only one nonce',{skip:!container||!db||process.env.LOCAL_TEXT_TEST_IDENTITY!=='1'},async()=>{
 const operation=nonce=>new Promise((resolve,reject)=>{
  const child=spawn('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']);let out='',err='';child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('close',c=>c===0?resolve(JSON.parse(out.split(/\r?\n/).find(l=>l.startsWith('{')))):reject(Error(err)));
  child.stdin.end(`begin;set local role service_role;select public.local_text_worker_operation(jsonb_build_object('version',1,'origin','https://omnira.example','deviceId','55555555-5555-4555-8555-555555555555','keyId','55555555-5555-4555-8555-555555555555','buildHash',repeat('a',64),'counter','1','nonce','${nonce}','issuedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'expiresAt',to_char((clock_timestamp()+interval '45 seconds') at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'method','POST','path','/api/local-text/worker/claim','bodySha256',repeat('b',64)),'claim','{}');select pg_sleep(0.5);commit;`);
 });
 const results=await Promise.all([operation('11111111-aaaa-4aaa-8aaa-111111111111'),operation('22222222-aaaa-4aaa-8aaa-222222222222')]);
 assert.equal(results.filter(r=>r.kind==='applied').length,1);assert.equal(results.filter(r=>r.kind==='refused'&&r.reason==='REPLAY_REFUSED').length,1);
 assert.equal(sql("select counter::text from public.local_text_devices where id='55555555-5555-4555-8555-555555555555';").trim(),'1');
});
