import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';
import {fixture,ollamaFixture,JOB,SNAPSHOT,temp} from './test-utils.mjs';
import {Readable} from 'node:stream';
const mod=await import('./worker.mjs').catch(()=>({}));const ol=await import('./ollama.mjs').catch(()=>({}));const tr=await import('./transport.mjs').catch(()=>({}));
test('CLI rejects invalid jobs before even inspecting a model',async()=>{
  const {main}=await import('./cli.mjs');
  await assert.rejects(()=>main(['run','--candidate','qwen3:8b'],Readable.from([JSON.stringify({...JOB,model:'remote'})])),/INVALID_JOB/);
});
test('invalid job dispatches no HTTP request',async t=>{let n=0;const port=await fixture(t,ollamaFixture(()=>{n++;return{label:'bil'};}));assert.equal(typeof mod.runJob,'function');const out=await mod.runJob({...JOB,model:'x'},{candidateId:'qwen3:8b',runtimeDir:await temp(t),client:ol.createOllamaClient(tr.createLoopbackTransport(port)),expectedSnapshot:SNAPSHOT});assert.equal(out.status,'rejected');assert.equal(n,0);});
test('changed model digest rejects before chat',async t=>{let n=0;const port=await fixture(t,ollamaFixture(()=>{n++;},(p,v)=>{if(p==='/api/tags')v.models[0].digest='b'.repeat(64);}));const out=await mod.runJob(JOB,{candidateId:'qwen3:8b',runtimeDir:await temp(t),client:ol.createOllamaClient(tr.createLoopbackTransport(port)),expectedSnapshot:SNAPSHOT});assert.equal(out.reasonCode,'IDENTITY_CHANGED');assert.equal(n,0);});
test('two real Node processes cannot share one GPU job slot',async t=>{
  const dir=await temp(t);let release,enteredResolve;const entered=new Promise(r=>enteredResolve=r);const wait=new Promise(r=>release=r);
  const port=await fixture(t,ollamaFixture(async()=>{enteredResolve();await wait;return{label:'bil'};}));
  const run=()=>new Promise((resolve,reject)=>{const script=`import {runJob} from ${JSON.stringify(new URL('./worker.mjs',import.meta.url).href)};import {createOllamaClient} from ${JSON.stringify(new URL('./ollama.mjs',import.meta.url).href)};import {createLoopbackTransport} from ${JSON.stringify(new URL('./transport.mjs',import.meta.url).href)};console.log(JSON.stringify(await runJob(${JSON.stringify(JOB)},{candidateId:'qwen3:8b',expectedSnapshot:${JSON.stringify(SNAPSHOT)},runtimeDir:${JSON.stringify(dir)},client:createOllamaClient(createLoopbackTransport(${port}))})));`;const child=spawn(process.execPath,['--input-type=module','-e',script]);let out='',err='';child.stdout.on('data',c=>out+=c);child.stderr.on('data',c=>err+=c);child.on('error',reject);child.on('exit',code=>code?reject(Error(err)):resolve(JSON.parse(out)));});
  const first=run();await entered;const second=await run();assert.equal(second.reasonCode,'LOCAL_BUSY');release();assert.equal((await first).status,'succeeded');
});
test('timeout after dispatch preserves uncertain lock and blocks next job',async t=>{
  const dir=await temp(t);const port=await fixture(t,ollamaFixture(async(b,req,res)=>{res.writeHead(200);res.write('{');await new Promise(r=>req.on('close',r));res.end();}));
  const options={candidateId:'qwen3:8b',runtimeDir:dir,client:ol.createOllamaClient(tr.createLoopbackTransport(port)),expectedSnapshot:SNAPSHOT,timeoutMs:80};
  const out=await mod.runJob(JOB,options);assert.equal(out.reasonCode,'LOCAL_TIMEOUT');assert.equal(JSON.parse(await readFile(path.join(dir,'job.lock'),'utf8')).state,'uncertain');assert.equal((await mod.runJob(JOB,options)).reasonCode,'LOCAL_BUSY');
});
test('unfinished HTTP 500 preserves uncertainty and prevents a second dispatch',async t=>{
  const dir=await temp(t);let chats=0;const port=await fixture(t,(req,res)=>{if(req.url==='/api/chat'){chats++;res.writeHead(500);res.write('{');return;}return ollamaFixture()(req,res);});
  const options={candidateId:'qwen3:8b',runtimeDir:dir,client:ol.createOllamaClient(tr.createLoopbackTransport(port)),expectedSnapshot:SNAPSHOT,timeoutMs:100};
  assert.equal((await mod.runJob(JOB,options)).reasonCode,'LOCAL_TIMEOUT');assert.equal(JSON.parse(await readFile(path.join(dir,'job.lock'),'utf8')).state,'uncertain');assert.equal((await mod.runJob(JOB,options)).reasonCode,'LOCAL_BUSY');assert.equal(chats,1);
});
test('digest drift during show cannot produce a success attributed to the old digest',async t=>{
  let changed=false;const port=await fixture(t,ollamaFixture(()=>({label:'bil'}),(p,v)=>{if(p==='/api/show')changed=true;if(p==='/api/tags'&&changed)v.models[0].digest='b'.repeat(64);}));
  const out=await mod.runJob(JOB,{candidateId:'qwen3:8b',runtimeDir:await temp(t),client:ol.createOllamaClient(tr.createLoopbackTransport(port)),expectedSnapshot:SNAPSHOT});assert.equal(out.reasonCode,'IDENTITY_CHANGED');assert.notEqual(out.status,'succeeded');
});
test('lifecycle lease blocks competing jobs throughout setup and between jobs',async t=>{
  assert.equal(typeof mod.withRuntimeLease,'function');const dir=await temp(t);let release,entered;const wait=new Promise(r=>release=r);const ready=new Promise(r=>entered=r);
  const lease=mod.withRuntimeLease(dir,async()=>{entered();await wait;});await ready;
  const out=await mod.runJob(JOB,{candidateId:'qwen3:8b',runtimeDir:dir,expectedSnapshot:SNAPSHOT});assert.equal(out.reasonCode,'LOCAL_BUSY');release();await lease;
});
