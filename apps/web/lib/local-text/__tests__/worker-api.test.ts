import {it,expect,vi} from 'vitest'
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
function packet(operation:WorkerOperation='claim',payload:unknown={}){const keys=generateKeyPairSync('ec',{namedCurve:'P-256'}),body=bytes(payload);const unsigned:UnsignedWorkerEnvelope={version:1,origin:'https://omnira.example',deviceId:id,keyId:id,buildHash:h,counter:'1',nonce:randomUUID(),issuedAt:now.toISOString(),expiresAt:new Date(now.getTime()+45000).toISOString(),method:'POST',path:'/api/local-text/worker/'+operation,bodySha256:sha256(body)};const envelope={...unsigned,signature:sign('sha256',workerSigningPayload(unsigned),{key:keys.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')};return {publicJwk:keys.publicKey.export({format:'jwk'}),body,envelope,request:new Request('https://omnira.example'+unsigned.path,{method:'POST',headers:{'content-type':'application/json','x-omnira-local-text':Buffer.from(canonicalJson(envelope)).toString('base64url')},body})}}
it('calls one atomic counter-and-operation RPC after actual signature verification',async()=>{
 const p=packet();let committed:unknown;const db={rpc:async(name:string,args:unknown)=>{if(name==='local_text_device_identity')return {data:{deviceId:id,ownerId:id,keyId:id,buildHash:h,status:'active',counter:'0',expiresAt:'2099-01-01T00:00:00.000Z',publicJwk:p.publicJwk,serverOrigin:'https://omnira.example',allowedProjects:[],allowedTasks:[]},error:null};committed={name,args};return {data:{kind:'applied',value:null},error:null}}} as unknown as Db
 const response=await api.executeWorkerRequest(db,p.request,'claim',now);expect(response).toEqual({version:1,requestId:p.envelope.nonce,operation:'claim',result:{kind:'applied',value:null}})
 expect(committed).toMatchObject({name:'local_text_worker_operation',args:{p_envelope:p.envelope,p_operation:'claim',p_payload:{}}})
})

const health={state:'ready',lifecycleLock:'clear',gpuAvailable:true,runtimeVersion:'0.40.5',runtimeHash:h,adapterHash:h,configurationHash:h,models:[{candidateId:'qwen3.5:4b',modelDigest:'sha256:'+h}]}
it.each([
 {label:'health state',operation:'heartbeat',payload:{health:{...health,state:['ready']},activeAttemptId:null}},
 {label:'lifecycle lock',operation:'heartbeat',payload:{health:{...health,lifecycleLock:['clear']},activeAttemptId:null}},
 {label:'candidate identity',operation:'heartbeat',payload:{health:{...health,models:[{candidateId:['qwen3.5:4b'],modelDigest:'sha256:'+h}]},activeAttemptId:null}},
 {label:'unknown outcome',operation:'fail',payload:{claim,outcome:['dispatch_unknown']}},
 {label:'known failure reason',operation:'fail',payload:{claim,outcome:'known_failed',reasonCode:['TOKEN_BUDGET_UNVERIFIED']}},
])('rejects a list-valued $label instead of coercing signed payload data',({operation,payload})=>{
 expect(()=>api.parseWorkerPayload(operation as WorkerOperation,bytes(payload))).toThrow('INVALID_WORKER_PAYLOAD')
})
it.each(['dispatch_unknown','cancelled'])('preserves primitive failure outcome %s',outcome=>{
 expect(api.parseWorkerPayload('fail',bytes({claim,outcome}))).toEqual({claim,outcome})
})
it.each(['TOKEN_BUDGET_UNVERIFIED','INPUT_TOO_LARGE','IDENTITY_CHANGED','INVALID_MODEL_RESPONSE','LOCAL_MODEL_UNAVAILABLE','LOCAL_STATE_ERROR'])('preserves primitive known-failure reason %s',reasonCode=>{
 expect(api.parseWorkerPayload('fail',bytes({claim,outcome:'known_failed',reasonCode}))).toEqual({claim,outcome:'known_failed',reasonCode})
})

const receiptCases=[
 {operation:'heartbeat' as const,field:'jobAction',valid:'continue',value:{deviceId:id,jobAction:'continue'}},
 {operation:'enroll' as const,field:'status',valid:'active',value:{deviceId:id,status:'active',version:1}},
 {operation:'complete' as const,field:'reviewStatus',valid:'approved',value:{id,state:'reviewing',reviewStatus:'approved'}},
]
async function executeReply(operation:WorkerOperation,value:unknown,kind='applied'){
 const result={label:'support'},payload=operation==='heartbeat'?{health,activeAttemptId:null}
  :operation==='complete'?{claim,result,resultHash:sha256(canonicalJson(result)),usage:{eval_count:4}}:{}
 const p=packet(operation,payload),calls:string[]=[]
 const db={rpc:async(name:string)=>{
  calls.push(name)
  if(name==='local_text_device_identity')return {data:{deviceId:id,ownerId:id,keyId:id,buildHash:h,status:'active',counter:'0',expiresAt:'2099-01-01T00:00:00.000Z',publicJwk:p.publicJwk,serverOrigin:'https://omnira.example',allowedProjects:[],allowedTasks:[]},error:null}
  expect(name).toBe('local_text_worker_operation')
  return {data:{kind,value},error:null}
 }} as unknown as Db
 return {response:await api.executeWorkerRequest(db,p.request,operation,now),requestId:p.envelope.nonce,calls}
}
it.each(receiptCases.flatMap(c=>['array','boxed','coercing'].map(representation=>({...c,representation}))))('returns UNKNOWN for $operation $field as $representation',async c=>{
 const convert=vi.fn(()=>c.valid)
 const invalid=c.representation==='array'?[c.valid]:c.representation==='boxed'?new String(c.valid):{toString:convert}
 const {response,requestId,calls}=await executeReply(c.operation,{...c.value,[c.field]:invalid})
 expect(convert).not.toHaveBeenCalled()
 expect(response.result).toEqual({kind:'unknown',reconcileId:requestId})
 expect(calls).toEqual(['local_text_device_identity','local_text_worker_operation'])
})
it.each(['applied','duplicate'])('preserves valid primitive enums in %s worker receipts',async kind=>{
 for(const c of receiptCases){
  const values=c.operation==='heartbeat'?['continue','abort']:c.operation==='enroll'?['pending','active']:['pending','approved','rejected','unknown']
  for(const value of values){
   const receipt={...c.value,[c.field]:value}
   const {response,calls}=await executeReply(c.operation,receipt,kind)
   expect(response.result).toEqual({kind,value:receipt})
   expect(calls).toEqual(['local_text_device_identity','local_text_worker_operation'])
  }
 }
})
