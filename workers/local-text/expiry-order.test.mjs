import {test} from 'node:test';import assert from 'node:assert/strict';
import {runWorker} from './worker.mjs';
test('expired raw journal is erased before a blocked runtime can prevent startup',async()=>{
 const events=[],claim={jobId:'job',attemptId:'attempt',inputHash:'a'.repeat(64),task:{kind:'classify',text:'private-source',labels:['a','b']}};
 let saved={version:1,claim,expiresAt:'2026-10-16T00:00:00Z',phase:'physical_unknown',payload:{result:'private-result'}};
 const config={deviceId:'device',origin:'https://example.test',once:true};
 await assert.rejects(()=>runWorker(config,{...config,now:()=>new Date('2026-10-17T00:00:00Z'),journal:{read:async()=>{events.push('read');return saved},write:async v=>{events.push('erase');saved=v}},runtime:{initialize:async()=>{events.push('initialize');throw Error('LOCAL_BUSY')}},client:{request:async()=>{throw Error('no request')}}},new AbortController().signal),/LOCAL_BUSY/);
 assert.deepEqual(events,['read','erase','initialize']);assert.equal(saved.phase,'expired_hold');assert.ok(!JSON.stringify(saved).includes('private'));
});
