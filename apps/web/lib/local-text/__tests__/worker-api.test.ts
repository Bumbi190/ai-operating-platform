import {it,expect} from 'vitest'
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto'
import {canonicalJson,sha256,workerSigningPayload,hashTask} from '@omnira/local-text-contract'
import type {Db,UnsignedWorkerEnvelope,WorkerOperation} from '../types'
const api=await import('../worker-api').catch(e=>{if(String(e).includes('Failed to load')||String(e).includes('Cannot find module'))return {} as typeof import('../worker-api');throw e})
const id='11111111-1111-4111-8111-111111111111',h='a'.repeat(64),now=new Date('2026-10-17T09:40:00.000Z')
const task={kind:'classify' as const,text:'Hej',labels:['support','annat']},claim={jobId:id,attemptId:id,deviceId:id,claimId:id,fence:1,inputHash:hashTask(task),selectionId:id,modelDigest:'sha256:'+h,leaseUntil:'2099-01-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',task}
const bytes=(v:unknown)=>Buffer.from(canonicalJson(v))
it('accepts only the closed operation payload shapes',()=>{
 expect(typeof api.parseWorkerPayload).toBe('function');expect(api.parseWorkerPayload('claim',bytes({}))).toEqual({})
 expect(api.parseWorkerPayload('started',bytes({claim}))).toEqual({claim})
 const result={label:'support'},complete={claim,result,resultHash:sha256(canonicalJson(result)),usage:{eval_count:4}}
 expect(api.parseWorkerPayload('complete',bytes(complete))).toEqual(complete)
})
it('rejects injected scopes, endpoints, swapped hashes and duplicate body keys',()=>{
 for(const body of [{projectId:id},{endpoint:'https://evil.example'},{model:'qwen3:8b'}])expect(()=>api.parseWorkerPayload('claim',bytes(body))).toThrow('INVALID_WORKER_PAYLOAD')
 expect(()=>api.parseWorkerPayload('complete',bytes({claim,result:{label:'support'},resultHash:'0'.repeat(64)}))).toThrow('INVALID_WORKER_PAYLOAD')
 expect(()=>api.parseWorkerPayload('claim',Buffer.from('{"x":1,"x":2}'))).toThrow('INVALID_WORKER_PAYLOAD')
 expect(()=>api.parseWorkerPayload('claim',Buffer.from([0xff]))).toThrow('INVALID_WORKER_PAYLOAD')
})
it('keeps heartbeat observations bounded and excludes arbitrary model names',()=>{
 const valid={health:{state:'ready',lifecycleLock:'clear',gpuAvailable:true,runtimeVersion:'0.40.5',runtimeHash:h,adapterHash:h,configurationHash:h,models:[{candidateId:'qwen3.5:4b',modelDigest:'sha256:'+h}]},activeAttemptId:null}
 expect(api.parseWorkerPayload('heartbeat',bytes(valid))).toEqual(valid)
 expect(()=>api.parseWorkerPayload('heartbeat',bytes({...valid,health:{...valid.health,models:[{candidateId:'arbitrary',modelDigest:'sha256:'+h}]}}))).toThrow('INVALID_WORKER_PAYLOAD')
})
function packet(){const keys=generateKeyPairSync('ec',{namedCurve:'P-256'}),body=bytes({});const unsigned:UnsignedWorkerEnvelope={version:1,origin:'https://omnira.example',deviceId:id,keyId:id,buildHash:h,counter:'1',nonce:randomUUID(),issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+45000).toISOString(),method:'POST',path:'/api/local-text/worker/claim',bodySha256:sha256(body)};const envelope={...unsigned,signature:sign('sha256',workerSigningPayload(unsigned),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};return {publicJwk:keys.publicKey.export({format:'jwk'}),body,envelope,request:new Request('https://omnira.example/api/local-text/worker/claim',{method:'POST',headers:{'content-type':'application/json','x-omnira-local-text':Buffer.from(canonicalJson(envelope)).toString('base64url')},body})}}
it('calls one atomic counter-and-operation RPC after actual signature verification',async()=>{
 const p=packet();let committed:unknown;const db={rpc:async(name:string,args:unknown)=>{if(name==='local_text_device_identity')return {data:{deviceId:id,ownerId:id,keyId:id,buildHash:h,status:'active',counter:'0',expiresAt:'2099-01-01T00:00:00.000Z',publicJwk:p.publicJwk,serverOrigin:'https://omnira.example',allowedProjects:[],allowedTasks:[]},error:null};committed={name,args};return {data:{kind:'applied',value:null},error:null}}} as unknown as Db
 const response=await api.executeWorkerRequest(db,p.request,'claim',now);expect(response).toEqual({version:1,requestId:p.envelope.nonce,operation:'claim',result:{kind:'applied',value:null}})
 expect(committed).toMatchObject({name:'local_text_worker_operation',args:{p_envelope:p.envelope,p_operation:'claim',p_payload:{}}})
})
