import {it,expect} from 'vitest'
import {canonicalJson,sha256,hashTask} from '@omnira/local-text-contract'
import type {Db} from '../types'
import type {CandidateEvidence,SelectionContext} from '../policy'
const api=await import('../policy').catch(()=>({}) as typeof import('../policy'))
const id='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222',now=new Date('2026-10-17T10:00:00Z'),h='a'.repeat(64)
const task={kind:'classify' as const,text:'Hjälp tack',labels:['support','annat']}
const ctx:SelectionContext={userId:id,projectId:id,conversationId:id,dataClass:'synthetic',placement:'cloud_control_review_allowed',policyVersion:'local_assist_v1',deadlineAt:'2026-10-17T10:05:00Z',jobCostCapUsd:0.25,dailyCostCapUsd:5,cloud:{authorized:true,reviewReady:true,taskReady:true,pricingVerified:true,reservationUsd:0.08,dailyRemainingUsd:4}}
function candidate(name='qwen3.5:4b',kind:typeof task.kind|'extract'|'summarize'='classify'):CandidateEvidence{
 const qualification={candidateId:name,taskKind:kind,modelDigest:'sha256:'+h,runtimeVersion:'0.40.5',runtimeHash:h,templateHash:h,schemaHash:h,adapterHash:h,configurationHash:h,tokenizerEvidenceHash:h,review:{status:'approved' as const,corpus:'sv-atlas-v2',cases:25,accuracy:1,invented:0,injectionPasses:0,reviewRunId:id},license:{permission:'allowed' as const,evidenceHash:h},p95Ms:30000}
 const evidenceHash=sha256(canonicalJson(qualification))
 return {qualification,evidenceHash,deployment:{id,deviceId:id,ownerId:id,status:'active',expiresAt:'2026-11-01T00:00:00Z',healthAt:now.toISOString(),healthState:'ready',lifecycleLock:'clear',gpuAvailable:true,runtimeVersion:'0.40.5',runtimeHash:h,adapterHash:h,configurationHash:h,modelDigests:['sha256:'+h],warmDigest:null},admission:{id,projectId:id,deviceId:id,deploymentId:id,taskKind:kind,status:'active',qualificationStatus:'verified',evidenceHash,modelDigest:'sha256:'+h,dataClass:'synthetic',placement:'cloud_control_review_allowed',policyVersion:'local_assist_v1',approvedInputHashes:[hashTask(kind==='classify'?task:{kind,text:task.text})],expiresAt:'2026-11-01T00:00:00Z',jobCostCapUsd:0.25,dailyCostCapUsd:5}}
}
const select=(candidates:CandidateEvidence[],context=ctx,t=task)=>api.selectLocalText({jobId,inputHash:hashTask(t),task:t,context,candidates,now})
it('unknown_evidence_never_eligible',()=>{
 expect(typeof api.selectLocalText).toBe('function')
 const good=candidate();expect(select([good]).kind).toBe('selected')
 for(const mutate of [(c:CandidateEvidence)=>{c.qualification.license.permission='unknown'},(c:CandidateEvidence)=>{c.qualification.review.status='unknown'},(c:CandidateEvidence)=>{c.deployment.healthAt='2026-10-17T09:59:15Z'},(c:CandidateEvidence)=>{c.admission.status='pending'},(c:CandidateEvidence)=>{c.qualification.schemaHash=''},(c:CandidateEvidence)=>{c.deployment.gpuAvailable=false},(c:CandidateEvidence)=>{c.qualification.review.cases=24},(c:CandidateEvidence)=>{c.qualification.review.invented=1}]){const c=structuredClone(good);mutate(c);c.evidenceHash=sha256(canonicalJson(c.qualification));c.admission.evidenceHash=c.evidenceHash;expect(select([c]).kind).not.toBe('selected')}
 expect(select([good],{...ctx,cloud:{...ctx.cloud!,pricingVerified:false}}).kind).toBe('needs_input')
 expect(select([good],{...ctx,cloud:undefined}).kind).toBe('needs_input')
})
it('task_first_choice_and_warm_equivalent',()=>{
 const first=candidate(),alt=candidate('qwen3.5:9b');alt.deployment.id=jobId;alt.admission.deploymentId=jobId
 const a=select([alt,first]);expect(a.kind==='selected'&&a.decision.candidateId).toBe('qwen3.5:4b')
 alt.deployment.warmDigest=alt.qualification.modelDigest
 const b=select([first,alt]);expect(b.kind==='selected'&&b.decision.candidateId).toBe('qwen3.5:9b')
 alt.qualification.review.accuracy=0.96;alt.evidenceHash=sha256(canonicalJson(alt.qualification));alt.admission.evidenceHash=alt.evidenceHash
 expect(select([alt,first]).kind==='selected'&&(select([alt,first]) as {decision:{candidateId:string}}).decision.candidateId).toBe('qwen3.5:4b')
 expect(select([candidate('qwen3:8b')]).kind).not.toBe('selected')
 for(const kind of ['extract','summarize'] as const){const t={kind,text:task.text};const c=candidate(kind==='summarize'?'qwen3:8b':'qwen3.5:4b',kind);c.admission.approvedInputHashes=[hashTask(t)];expect(api.selectLocalText({jobId,inputHash:hashTask(t),task:t,context:ctx,candidates:[c],now}).kind).toBe('selected');c.qualification.candidateId='qwen3.5:9b';c.evidenceHash=sha256(canonicalJson(c.qualification));c.admission.evidenceHash=c.evidenceHash;expect(api.selectLocalText({jobId,inputHash:hashTask(t),task:t,context:ctx,candidates:[c],now}).kind).not.toBe('selected')}
})
it('budget_and_placement_precede_ranking',()=>{
 const c=candidate();expect(select([c],{...ctx,jobCostCapUsd:0.01}).kind).toBe('needs_input')
 expect(select([],{...ctx,placement:'local_only'} as unknown as SelectionContext).kind).toBe('needs_input')
 expect(select([c],{...ctx,cloud:{...ctx.cloud!,authorized:false}}).kind).toBe('needs_input')
 expect(select([]).kind).toBe('cloud_eligible')
 const out=select([c]);expect(out.kind).toBe('selected');if(out.kind==='selected'){expect(out.decision.totalExpectedCostUsd).toBeNull();expect(out.decision.costUncertainty).toContain('operating_cost_unknown');expect(out.decision.validUntil).toBe('2026-10-17T10:00:30.000Z');expect(Object.isFrozen(out.decision)).toBe(true)}
})
it('drift_revokes_start',async()=>{
 const c=candidate(),s=select([c]);expect(s.kind).toBe('selected');if(s.kind!=='selected')return
 const claim={jobId,attemptId:id,deviceId:id,claimId:id,fence:1,inputHash:hashTask(task),selectionId:s.decision.id,modelDigest:c.qualification.modelDigest,leaseUntil:'2026-10-17T10:00:40.000Z',expiresAt:new Date(ctx.deadlineAt).toISOString(),task}
 const db=(data:unknown)=>({rpc:async()=>({data,error:null})}) as unknown as Db
 expect(await api.revalidateSelection(db({kind:'applied',value:s.decision}),claim,now)).toEqual({kind:'applied',value:s.decision})
 expect(await api.revalidateSelection(db({kind:'refused',reason:'EVIDENCE_DRIFT'}),claim,now)).toEqual({kind:'refused',reason:'EVIDENCE_DRIFT'})
 expect((await api.revalidateSelection(db({kind:'applied',value:{...s.decision,modelDigest:'sha256:'+'b'.repeat(64)}}),claim,now)).kind).toBe('unknown')
})
