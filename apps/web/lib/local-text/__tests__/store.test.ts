import {describe,it,expect,vi} from 'vitest'
import {hashTask,canonicalJson,sha256} from '@omnira/local-text-contract'
import type {Db,VerifiedContext,RequestLocalText,SelectionDecision,JobReceipt} from '../types'
const api=await import('../store').catch(e=>{if(String(e).includes('Failed to load')||String(e).includes('Cannot find module'))return {} as typeof import('../store');throw e})
const id='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222'
const request:RequestLocalText={projectId:id,conversationId:id,idempotencyKey:id,task:{kind:'classify',text:'Behöver hjälp',labels:['support','annat']}}
const context:VerifiedContext={userId:id,projectId:id,conversationId:id,dataClass:'synthetic',placement:'cloud_control_review_allowed',policyVersion:'local_assist_v1',admissionId:id,deadlineAt:'2099-01-01T00:00:00.000Z',jobCostCapUsd:0.25,dailyCostCapUsd:5}
const selection:SelectionDecision={id,jobId,inputHash:hashTask(request.task),projectId:id,profile:'local_assist_v1',policyVersion:'local_assist_v1',candidateId:'qwen3.5:4b',modelDigest:'sha256:'+'a'.repeat(64),deploymentId:id,admissionId:id,evidenceHash:'b'.repeat(64),healthAt:'2026-10-17T00:00:00.000Z',validUntil:'2099-01-01T00:00:00.000Z',exclusions:{},totalExpectedCostUsd:0.01,costUncertainty:['operating_cost_unknown'],fallback:'governed_openai'}
const receipt:JobReceipt={id:jobId,projectId:id,conversationId:id,state:'queued',reasonCode:null,result:null,reviewStatus:'pending',selectionId:id,expiresAt:'2099-01-01T00:00:00.000Z',updatedAt:'2026-10-17T00:00:00.000Z'}
const db=(response:{data:unknown,error:unknown})=>({rpc:async()=>response}) as unknown as Db

describe('local text store RPC boundary',()=>{
 it('carries strict request, selection and versioned input hash to atomic enqueue',async()=>{
  expect(typeof api.enqueueJob).toBe('function')
  let sent:unknown;const client={rpc:async(name:string,args:unknown)=>{sent={name,args};return {data:{kind:'applied',value:receipt},error:null}}} as unknown as Db
  expect(await api.enqueueJob(client,context,request,selection)).toEqual({kind:'applied',value:receipt})
  expect(sent).toMatchObject({name:'local_text_enqueue',args:{p_job_id:jobId,p_input_hash:hashTask(request.task),p_selection:selection,p_request:request}})
 })
 it('rejects mismatched project, source hash or admission before persistence',async()=>{
  const client={rpc:async()=>{throw Error('must not send')}} as unknown as Db
  for(const changed of [{...selection,projectId:jobId},{...selection,inputHash:'0'.repeat(64)},{...selection,admissionId:jobId}])expect(await api.enqueueJob(client,context,request,changed)).toMatchObject({kind:'refused'})
 })
 it('distinguishes unreadable transaction from proven refusal and exact duplicate',async()=>{
  expect(await api.enqueueJob(db({data:null,error:new Error('connection lost')}),context,request,selection)).toEqual({kind:'unknown',reconcileId:jobId})
  expect(await api.enqueueJob(db({data:{kind:'refused',reason:'IDEMPOTENCY_CONFLICT'},error:null}),context,request,selection)).toEqual({kind:'refused',reason:'IDEMPOTENCY_CONFLICT'})
  expect(await api.enqueueJob(db({data:{kind:'duplicate',value:receipt},error:null}),context,request,selection)).toEqual({kind:'duplicate',value:receipt})
 })
 it('idempotent retry returns the original job even when a fresh candidate UUID was allocated',async()=>{
  const original={...receipt,id:'33333333-3333-4333-8333-333333333333'}
  const out=await api.enqueueJob(db({data:{kind:'duplicate',value:original},error:null}),context,request,selection)
  expect(out).toEqual({kind:'duplicate',value:original})
 })
 it('never exposes unreviewed result even when a response carries one',async()=>{
  const out=await api.enqueueJob(db({data:{kind:'applied',value:{...receipt,result:{label:'support'}}},error:null}),context,request,selection)
  expect(out.kind).toBe('applied');if(out.kind==='applied')expect(out.value.result).toBeNull()
 })
 it('refuses malformed, foreign and result-schema-corrupt receipts',async()=>{
  for(const changed of [{...receipt,projectId:jobId},{...receipt,state:'invented'},{...receipt,state:'succeeded',reviewStatus:'approved',result:{label:'forged'}}])expect(await api.enqueueJob(db({data:{kind:'applied',value:changed},error:null}),context,request,selection)).toEqual({kind:'unknown',reconcileId:jobId})
 })
 it('claim parsing binds device, exact source hash and unexpired lease',async()=>{
  const claim={jobId,attemptId:id,deviceId:id,claimId:id,fence:1,inputHash:hashTask(request.task),selectionId:id,modelDigest:selection.modelDigest,leaseUntil:'2099-01-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',task:request.task}
  expect(await api.claimJob(db({data:{kind:'applied',value:claim},error:null}),id,new Date('2026-10-17'))).toEqual({kind:'applied',value:claim})
  for(const changed of [{...claim,deviceId:jobId},{...claim,inputHash:'0'.repeat(64)},{...claim,leaseUntil:'2000-01-01T00:00:00.000Z'}])expect(await api.claimJob(db({data:{kind:'applied',value:changed},error:null}),id,new Date('2026-10-17'))).toEqual({kind:'unknown',reconcileId:id})
 })
 it('attempt boundary rejects invalid results and preserves unknown commit certainty',async()=>{
  const claim={jobId,attemptId:id,deviceId:id,claimId:id,fence:1,inputHash:hashTask(request.task),selectionId:id,modelDigest:selection.modelDigest,leaseUntil:'2099-01-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',task:request.task}
  expect(await api.transitionAttempt(db({data:null,error:Error('lost commit reply')}),claim,{type:'completed',result:{label:'support'},resultHash:'f'.repeat(64)})).toEqual({kind:'unknown',reconcileId:id})
  expect(await api.transitionAttempt(db({data:null,error:null}),claim,{type:'completed',result:{label:'invalid'},resultHash:'f'.repeat(64)})).toEqual({kind:'refused',reason:'INVALID_ATTEMPT'})
 })
 it('owner-bound read separates unavailable from absent and expires raw output',async()=>{
  await expect(api.readReceipt(db({data:null,error:Error('down')}),id,jobId)).rejects.toThrow('LOCAL_TEXT_STATE_UNAVAILABLE')
  expect(await api.readReceipt(db({data:null,error:null}),id,jobId)).toBeNull()
  const value={receipt:{...receipt,state:'succeeded',reviewStatus:'approved',expiresAt:'2000-01-01T00:00:00.000Z',result:{label:'support'}},task:request.task}
  const out=await api.readReceipt(db({data:value,error:null}),id,jobId);expect(out?.result).toBeNull();expect(out?.reasonCode).toBe('PAYLOAD_EXPIRED')
 })
})
it('owner admission preserves commit uncertainty and rejects foreign receipt scope',async()=>{
 const specification={id,expectedVersion:1}
 expect(await api.writeOwnerAdmission(db({data:null,error:Error('lost commit')}),id,id,id,'revoke',specification)).toEqual({kind:'unknown',reconcileId:id})
 const value={id,projectId:jobId,deviceId:id,status:'revoked',evidenceHash:'a'.repeat(64),version:2,expiresAt:'2099-01-01T00:00:00.000Z'}
 expect(await api.writeOwnerAdmission(db({data:{kind:'applied',value},error:null}),id,id,id,'revoke',specification)).toEqual({kind:'unknown',reconcileId:id})
})

function malformedEnum(representation:string,value:string){
 const convert=vi.fn(()=>value)
 return {convert,value:representation==='array'?[value]:representation==='boxed'?new String(value):{toString:convert}}
}
it.each(['array','boxed','coercing'])('refuses %s review status across stored receipt consumers',async representation=>{
 const bad=malformedEnum(representation,'approved')
 const value={...receipt,state:'succeeded',reviewStatus:bad.value,result:{label:'support'}}
 expect(()=>api.parseStoredReceipt(value,request.task,{jobId})).toThrow('INVALID_RECEIPT')
 await expect(api.readReceipt(db({data:{receipt:value,task:request.task},error:null}),id,jobId)).rejects.toThrow('LOCAL_TEXT_STATE_UNAVAILABLE')
 for(const kind of ['applied','duplicate'])expect(await api.enqueueJob(db({data:{kind,value},error:null}),context,request,selection)).toEqual({kind:'unknown',reconcileId:jobId})
 const claim={jobId,attemptId:id,deviceId:id,claimId:id,fence:1,inputHash:hashTask(request.task),selectionId:id,modelDigest:selection.modelDigest,leaseUntil:'2099-01-01T00:00:00.000Z',expiresAt:'2099-01-01T00:00:00.000Z',task:request.task}
 expect(await api.transitionAttempt(db({data:{kind:'applied',value},error:null}),claim,{type:'completed',result:{label:'support'},resultHash:sha256(canonicalJson({label:'support'}))})).toEqual({kind:'unknown',reconcileId:id})
 expect(bad.convert).not.toHaveBeenCalled()
})
it.each(['pending','approved','rejected','unknown'])('preserves primitive review status %s and existing result suppression',async reviewStatus=>{
 const value={...receipt,state:'succeeded',reviewStatus,result:{label:'support'}}
 const result=await api.readReceipt(db({data:{receipt:value,task:request.task},error:null}),id,jobId)
 expect(result?.reviewStatus).toBe(reviewStatus)
 expect(result?.result).toEqual(reviewStatus==='approved'?{label:'support'}:null)
})
it.each(['array','boxed','coercing'])('preserves UNKNOWN for a %s admission receipt status',async representation=>{
 const bad=malformedEnum(representation,'revoked')
 const value={id,projectId:id,deviceId:id,status:bad.value,evidenceHash:'a'.repeat(64),version:2,expiresAt:'2099-01-01T00:00:00.000Z'}
 const call=vi.fn(async()=>({data:{kind:'applied',value},error:null}))
 expect(await api.writeOwnerAdmission({rpc:call} as unknown as Db,id,id,id,'revoke',{id,expectedVersion:1})).toEqual({kind:'unknown',reconcileId:id})
 expect(call).toHaveBeenCalledTimes(1)
 expect(bad.convert).not.toHaveBeenCalled()
})
it.each(['active','paused','revoked'])('preserves valid primitive admission status %s',async status=>{
 const value={id,projectId:id,deviceId:id,status,evidenceHash:'a'.repeat(64),version:2,expiresAt:'2099-01-01T00:00:00.000Z'}
 for(const kind of ['applied','duplicate'])expect(await api.writeOwnerAdmission(db({data:{kind,value},error:null}),id,id,id,'revoke',{id,expectedVersion:1})).toEqual({kind,value})
})
it.each(['array','boxed','coercing'])('does not classify cost evidence with a %s stage as metered',async representation=>{
 const bad=malformedEnum(representation,'local_review')
 const data={jobId,stages:[{stage:bad.value,state:'response_ready',usageRef:id,costUsd:0.01,tokensIn:100,tokensOut:10}]}
 expect(await api.readLocalTextCost(db({data,error:null}),id,jobId)).toMatchObject({status:'unverified',totalApiCostUsd:null,totalOperatingCostUsd:null,guaranteedSavings:false})
 expect(bad.convert).not.toHaveBeenCalled()
})
it.each(['local_review','cloud_task','cloud_review'])('preserves primitive metered cost stage %s without granting savings certainty',async stage=>{
 const data={jobId,stages:[{stage,state:'response_ready',usageRef:id,costUsd:0.01,tokensIn:100,tokensOut:10}]}
 expect(await api.readLocalTextCost(db({data,error:null}),id,jobId)).toMatchObject({status:'metered',totalApiCostUsd:0.01,totalOperatingCostUsd:null,guaranteedSavings:false})
})
