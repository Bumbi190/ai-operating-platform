import {test} from 'node:test';import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../packages/local-text-contract/index.mjs';
const api=await import('../client.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
const id='11111111-1111-4111-8111-111111111111',config={origin:'https://omnira.example',deviceId:id,keyId:id,buildHash:'a'.repeat(64),counterFile:'operator-owned-counter.json'};
test('signed requests serialize durable counters and bind exact fixed origin/path/body',async()=>{
 assert.equal(typeof api.createWorkerClient,'function');const sent=[];let counter=0,active=0,max=0;
 const client=api.createWorkerClient(config,{nextCounter:async()=>String(++counter),sign:async(unsigned)=>({...unsigned,signature:Buffer.alloc(64).toString('base64url')}),transport:async(url,options)=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));const envelope=JSON.parse(Buffer.from(options.headers['x-omnira-local-text'],'base64url'));assert.equal(envelope.origin,config.origin);assert.equal(envelope.path,new URL(url).pathname);assert.equal(envelope.bodySha256,sha256(options.body));sent.push(envelope);active--;return {version:1,requestId:envelope.nonce,operation:'claim',result:{kind:'applied',value:null}};}});
 await Promise.all([client.request('claim',{}),client.request('claim',{})]);assert.equal(max,1);assert.deepEqual(sent.map(e=>e.counter),['1','2']);assert.equal(new Set(sent.map(e=>e.nonce)).size,2);
});
test('rejects operator origin ambiguity, task endpoint knobs and malformed/mismatched acknowledgments',async()=>{
 for(const origin of ['http://omnira.example','https://user:pass@omnira.example','https://omnira.example/path','https://omnira.example/','https://omnira.example?x=1'])assert.throws(()=>api.createWorkerClient({...config,origin}),/INVALID_WORKER_CONFIG/);
 let sent=0;const client=api.createWorkerClient(config,{nextCounter:async()=> '1',sign:async(u)=>({...u,signature:Buffer.alloc(64).toString('base64url')}),transport:async()=>{sent++;return {version:1,requestId:id,operation:'claim',result:{kind:'applied',value:null}};}});
 await assert.rejects(client.request('arbitrary',{}),/INVALID_OPERATION/);assert.equal(sent,0);
 const ack=await client.request('claim',{});assert.equal(ack.kind,'unknown');assert.equal(sent,1);
});
test('metadata retry requires a fresh durable counter, never transparent wire retry',async()=>{
 let wire=0,count=0;const client=api.createWorkerClient(config,{nextCounter:async()=>String(++count),sign:async(u)=>({...u,signature:Buffer.alloc(64).toString('base64url')}),transport:async()=>{wire++;throw Error('connection lost');}});
 assert.equal((await client.request('claim',{})).kind,'unknown');assert.equal(wire,1);assert.equal(count,1);
});
