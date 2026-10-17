import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {randomUUID} from 'node:crypto';
const api=await import('../identity-state.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return {};throw e;});
async function temp(fn){const dir=await mkdtemp(path.join(os.tmpdir(),'omnira-counter-'));try{return await fn(path.join(dir,'counter.json'));}finally{await rm(dir,{recursive:true,force:true});}}
test('counter is explicitly initialized and durably advanced before requests',()=>temp(async file=>{
 assert.equal(typeof api.initializeCounter,'function','missing durable identity counter');const keyId=randomUUID();
 await assert.rejects(api.nextCounter(file,keyId),/IDENTITY_STATE_UNAVAILABLE/);
 await api.initializeCounter(file,keyId);assert.equal(await api.nextCounter(file,keyId),'1');assert.equal(await api.nextCounter(file,keyId),'2');
 assert.equal(JSON.parse(await readFile(file,'utf8')).counter,'2');await assert.rejects(api.initializeCounter(file,keyId),/IDENTITY_EXISTS/);
 await assert.rejects(api.nextCounter(file,randomUUID()),/IDENTITY_STATE_UNAVAILABLE/);
}));
test('stale lock and exhausted or corrupt state never reset the counter',()=>temp(async file=>{
 const keyId=randomUUID();await api.initializeCounter(file,keyId);await writeFile(file+'.lock','owned-uncertain-lock');
 await assert.rejects(api.nextCounter(file,keyId),/IDENTITY_BUSY/);assert.equal(await readFile(file+'.lock','utf8'),'owned-uncertain-lock');await rm(file+'.lock');
 await writeFile(file,JSON.stringify({version:1,keyId,counter:'18446744073709551615'}));await assert.rejects(api.nextCounter(file,keyId),/COUNTER_EXHAUSTED/);
 await writeFile(file,'broken');await assert.rejects(api.nextCounter(file,keyId),/IDENTITY_STATE_UNAVAILABLE/);
}));
