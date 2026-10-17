import { test } from 'node:test';
import assert from 'node:assert/strict';
const api = await import('./index.mjs').catch(e => { if(e.code==='ERR_MODULE_NOT_FOUND') return {}; throw e; });
const id='e2a04cb3-6335-463a-ad44-09bc780b1479';
const request=()=>({projectId:id,conversationId:id,idempotencyKey:id,task:{kind:'classify',text:'Kundfråga',labels:['support','annat']}});
const hash='a'.repeat(64), now='2026-10-17T08:50:00.000Z';
const claim=()=>({jobId:id,attemptId:id,deviceId:id,claimId:id,fence:1,inputHash:hash,selectionId:id,modelDigest:'sha256:'+hash,leaseUntil:now,expiresAt:now,task:request().task});
const envelope=()=>({version:1,origin:'https://omnira.example',deviceId:id,buildHash:hash,keyId:id,counter:'1',nonce:id,issuedAt:now,expiresAt:'2026-10-17T08:51:00.000Z',method:'POST',path:'/api/local-text/worker/claim',bodySha256:hash,signature:Buffer.alloc(64).toString('base64url')});

test('parseRequest accepts only bounded task data and makes an independent copy',()=>{
 assert.equal(typeof api.parseRequest,'function','missing strict request parser');
 const r=request(), v=api.parseRequest(r); assert.deepEqual(v,r);v.task.labels[0]='mutated';assert.equal(r.task.labels[0],'support');
});
test('rejects model endpoint and privacy overrides at every level',()=>{
 for(const key of ['model','endpoint','provider','dataClass','systemPrompt','__proto__']){
  const r=request();Object.defineProperty(r,key,{value:'x',enumerable:true});assert.throws(()=>api.parseRequest(r),/INVALID_REQUEST/);
 }
 const r=request();r.task.options={};assert.throws(()=>api.parseRequest(r),/INVALID_TASK/);
});
test('strict task boundaries include Unicode, labels, UUIDs and scalar validity',()=>{
 const r=request();r.task.text='å'.repeat(3000);assert.doesNotThrow(()=>api.parseRequest(r));
 r.task.text+='å';assert.throws(()=>api.parseRequest(r),/INVALID_TASK/);
 for(const bad of ['', '  ','\ud800']){r.task.text=bad;assert.throws(()=>api.parseRequest(r),/INVALID_TASK/);}
 for(const labels of [['x'],['x','x'],[' x','y'],['x','y'.repeat(65)],Array.from({length:9},(_,i)=>String(i))]){const v=request();v.task.labels=labels;assert.throws(()=>api.parseRequest(v),/INVALID_TASK/);}
 r.task=request().task;r.projectId='not-a-uuid';assert.throws(()=>api.parseRequest(r),/INVALID_REQUEST/);
});
test('hash binds task and source exactly without Unicode normalization',()=>{
 const task=request().task; const h=api.hashTask(task);assert.match(h,/^[a-f0-9]{64}$/);
 assert.equal(h,api.hashTask({labels:task.labels,text:task.text,kind:task.kind}));
 assert.notEqual(h,api.hashTask({...task,text:'Annan text'}));
 assert.notEqual(api.hashTask({...task,text:'é'}),api.hashTask({...task,text:'e\u0301'}));
 assert.notEqual(h,api.hashTask({kind:'summarize',text:task.text}));
});
test('results preserve exact task schemas and reject hallucinated shape',()=>{
 const t=request().task;assert.deepEqual(api.validateTaskResult(t,{label:'support'}),{label:'support'});
 assert.throws(()=>api.validateTaskResult(t,{label:'unknown'}),/INVALID_RESULT/);
 assert.deepEqual(api.validateTaskResult({kind:'extract',text:'x'},{company:null,city:null,registrationNumber:null}),{company:null,city:null,registrationNumber:null});
 assert.throws(()=>api.validateTaskResult({kind:'extract',text:'x'},{company:'A',city:null}),/INVALID_RESULT/);
 assert.throws(()=>api.validateTaskResult({kind:'summarize',text:'x'},{bullets:Array(4).fill('x')}),/INVALID_RESULT/);
 assert.throws(()=>api.validateTaskResult({kind:'summarize',text:'x'},{bullets:[' ']}),/INVALID_RESULT/);
});
test('claim validates binding fields and refuses substitution knobs',()=>{
 assert.deepEqual(api.parseClaim(claim()),claim());
 for(const patch of [{fence:0},{fence:1.5},{inputHash:'bad'},{modelDigest:'qwen3:8b'},{expiresAt:'bad'},{task:{kind:'extract',text:''}},{endpoint:'https://evil'}])assert.throws(()=>api.parseClaim({...claim(),...patch}));
});
test('envelope validates canonical counter, closed path, TTL and signature encoding',()=>{
 assert.deepEqual(api.parseWorkerEnvelope(envelope()),envelope());
 for(const patch of [{counter:'01'},{counter:'-1'},{counter:'18446744073709551616'},{path:'/api/other'},{method:'GET'},{signature:'x'},{version:2},{expiresAt:'2026-10-17T08:51:00.001Z'}])assert.throws(()=>api.parseWorkerEnvelope({...envelope(),...patch}),/INVALID_ENVELOPE/);
});
test('rejects cyclic, nonplain and symbol-keyed request objects',()=>{
 assert.throws(()=>api.parseRequest(Object.assign(Object.create({}),request())),/INVALID_REQUEST/);
 const r=request();r[Symbol('hidden')]='x';assert.throws(()=>api.parseRequest(r),/INVALID_REQUEST/);
});

test('canonical worker signing payload binds all header fields with a fixed domain',()=>{
 assert.equal(typeof api.workerSigningPayload,'function','missing canonical signature payload');
 const {signature,...unsigned}=envelope();const bytes=api.workerSigningPayload(unsigned);
 assert.ok(Buffer.from(bytes).toString('utf8').startsWith('omnira.local_text.worker.v1\n{'));
 assert.notDeepEqual(api.workerSigningPayload({...unsigned,counter:'2'}),bytes);
 assert.notDeepEqual(api.workerSigningPayload({...unsigned,bodySha256:'b'.repeat(64)}),bytes);
 assert.throws(()=>api.workerSigningPayload({...unsigned,signature}),/INVALID_UNSIGNED_ENVELOPE/);
});
