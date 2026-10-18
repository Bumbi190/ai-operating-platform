import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
const container=process.env.LOCAL_TEXT_TEST_CONTAINER,db=process.env.LOCAL_TEXT_TEST_DATABASE;
function sql(text){const r=spawnSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],{input:text,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim()}
test('current device evidence cannot drift between human approval and its commit',{skip:!container||!/^local_text_publication_[a-z0-9]+$/.test(db??'')},async()=>{
 assert.equal(container,'omnira-atlas-local-text-test-20261017');const approval=sql('select approval_id from public.local_text_human_reviews limit 1;');assert.match(approval,/^[a-f0-9-]{36}$/)
 const a=spawn('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']);let out='',err='',ready;
 const signal=new Promise((resolve,reject)=>{ready={resolve,reject}});a.stdout.on('data',b=>{out+=b;if(out.includes('APPROVAL_READY'))ready.resolve()});a.stderr.on('data',b=>err+=b);const ended=new Promise((resolve,reject)=>{a.on('error',reject);a.on('close',c=>c===0?resolve():reject(Error(err)))});
 a.stdin.write(`begin;set local role service_role;select public.local_text_resolve_approval('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','${approval}','approve',1);select 'APPROVAL_READY';\n`)
 let writerDone=false,writerReady;const started=new Promise(resolve=>writerReady=resolve);try{
  await Promise.race([signal,ended.then(()=>{throw Error('APPROVAL_ENDED_EARLY')})]);assert.match(out,/"kind": "applied"/)
  const writer=new Promise((resolve,reject)=>{const b=spawn('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At']);let e='',o='';b.stdout.on('data',x=>{o+=x;if(o.includes('DRIFT_WRITER_STARTED'))writerReady()});b.stderr.on('data',x=>e+=x);b.on('error',reject);b.on('close',c=>{writerDone=true;c===0?resolve():reject(Error(e))});b.stdin.end("select 'DRIFT_WRITER_STARTED';update public.local_text_devices set reported_health=jsonb_set(reported_health,'{adapterHash}',to_jsonb(repeat('b',64))) where id='55555555-5555-4555-8555-555555555555';")});
  await started;await delay(200);assert.equal(writerDone,false,'drift writer committed before approved publication committed')
  a.stdin.end('commit;\n');await ended;await writer;assert.equal(sql('select state from public.local_text_jobs limit 1;'),'succeeded')
 }finally{if(!a.stdin.destroyed)a.stdin.end('rollback;\n')}
});
