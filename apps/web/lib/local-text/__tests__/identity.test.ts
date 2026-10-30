import {it,expect} from 'vitest'
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto'
import {canonicalJson,sha256,workerSigningPayload} from '@omnira/local-text-contract'
import type {UnsignedWorkerEnvelope,WorkerEnvelope,WorkerOperation,Db} from '../types'
const api=await import('../identity').catch(e=>{if(String(e).includes('Failed to load')||String(e).includes('Cannot find module'))return {} as typeof import('../identity');throw e})
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'}),jwk=publicKey.export({format:'jwk'})
const now=new Date('2026-10-17T09:40:00.000Z'),deviceId=randomUUID(),keyId=randomUUID(),body=Buffer.from('{}')
function signed(patch:Partial<UnsignedWorkerEnvelope>={}):WorkerEnvelope{
 const unsigned:UnsignedWorkerEnvelope={version:1,origin:'https://omnira.example',deviceId,keyId,buildHash:'a'.repeat(64),counter:'1',nonce:randomUUID(),issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+45000).toISOString(),method:'POST',path:'/api/local-text/worker/claim',bodySha256:sha256(body),...patch}
 return {...unsigned,signature:sign('sha256',workerSigningPayload(unsigned),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}
}
const metadata=(patch:Record<string,unknown>={})=>({deviceId,keyId,publicJwk:jwk,serverOrigin:'https://omnira.example',buildHash:'a'.repeat(64),status:'active',counter:'0',ownerId:randomUUID(),expiresAt:'2099-01-01T00:00:00.000Z',allowedProjects:[],allowedTasks:[],...patch})
const db=(value:unknown,error:unknown=null)=>({rpc:async()=>({data:value,error})}) as unknown as Db
function request(envelope:WorkerEnvelope,bytes:Uint8Array=body,headerText=canonicalJson(envelope),path='/api/local-text/worker/claim'){
 return new Request('https://omnira.example'+path,{method:'POST',headers:{'content-type':'application/json','x-omnira-local-text':Buffer.from(headerText).toString('base64url')},body:bytes as unknown as BodyInit})
}
it('verifies exact P1363 SHA256 signature over every field and raw body',()=>{
 expect(typeof api.verifyWorkerSignature).toBe('function');const e=signed();expect(api.verifyWorkerSignature(e,body,jwk,now)).toBe(true)
 expect(api.verifyWorkerSignature(e,Buffer.from('{"swapped":true}'),jwk,now)).toBe(false)
 for(const patch of [{counter:'2'},{buildHash:'b'.repeat(64)},{path:'/api/local-text/worker/complete'},{keyId:randomUUID()},{method:'GET'}])expect(api.verifyWorkerSignature({...e,...patch},body,jwk,now)).toBe(false)
})
it('rejects correctly signed expired and future requests',()=>{
 const old=signed({issuedAt:'2026-10-17T09:38:00.000Z',expiresAt:'2026-10-17T09:38:45.000Z'}),future=signed({issuedAt:'2026-10-17T09:41:00.000Z',expiresAt:'2026-10-17T09:41:45.000Z'})
 expect(api.verifyWorkerSignature(old,body,jwk,now)).toBe(false);expect(api.verifyWorkerSignature(future,body,jwk,now)).toBe(false)
 expect(api.verifyWorkerSignature(signed(),body,{...jwk,d:'not-public'},now)).toBe(false)
})
it('derives the principal from stored identity and returns verified bytes, never body scopes',async()=>{
 const e=signed(),record=metadata();const verified=await api.verifyWorkerRequest(db(record),request(e),'claim',now)
 expect(verified.deviceId).toBe(deviceId);expect(verified.ownerId).toBe(record.ownerId);expect(verified.envelope.nonce).toBe(e.nonce);expect(Buffer.from(verified.bodyBytes)).toEqual(body)
})
it('pending_device_cannot_claim and revoked device cannot authenticate',async()=>{
 for(const status of ['pending','revoked','lost','retired','paused'])await expect(api.verifyWorkerRequest(db(metadata({status})),request(signed()),'claim',now)).rejects.toThrow('INVALID_WORKER_REQUEST')
})
it('rejects stale counters, wrong build and wrong stored key even with valid signatures',async()=>{
 for(const patch of [{counter:'1'},{buildHash:'b'.repeat(64)},{keyId:randomUUID()}])await expect(api.verifyWorkerRequest(db(metadata(patch)),request(signed()),'claim',now)).rejects.toThrow('INVALID_WORKER_REQUEST')
})
it('rejects duplicate header fields, path substitution and oversized body before dispatch',async()=>{
 const e=signed();const duplicate=canonicalJson(e).replace('{','{"counter":"9",')
 await expect(api.verifyWorkerRequest(db(metadata()),request(e,body,duplicate),'claim',now)).rejects.toThrow('INVALID_WORKER_REQUEST')
 await expect(api.verifyWorkerRequest(db(metadata()),request(e,body,canonicalJson(e),'/api/local-text/worker/complete'),'complete',now)).rejects.toThrow('INVALID_WORKER_REQUEST')
 await expect(api.verifyWorkerRequest(db(metadata()),request(e,Buffer.alloc(65537)),'claim',now)).rejects.toThrow('INVALID_WORKER_REQUEST')
})
it('separates unreadable identity from proven unknown device',async()=>{
 await expect(api.verifyWorkerRequest(db(null,Error('down')),request(signed()),'claim',now)).rejects.toThrow('LOCAL_TEXT_STATE_UNAVAILABLE')
 await expect(api.verifyWorkerRequest(db(null),request(signed()),'claim',now)).rejects.toThrow('INVALID_WORKER_REQUEST')
})
it('rejects a valid signed request replayed to a different deployment origin',async()=>{
 const e=signed();const foreign=new Request('https://other.example/api/local-text/worker/claim',{method:'POST',headers:{'content-type':'application/json','x-omnira-local-text':Buffer.from(canonicalJson(e)).toString('base64url')},body})
 await expect(api.verifyWorkerRequest(db(metadata()),foreign,'claim',now)).rejects.toThrow('INVALID_WORKER_REQUEST')
})
