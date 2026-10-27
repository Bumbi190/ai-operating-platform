import {it,expect,vi} from 'vitest'
import type {JobSnapshot} from '../fallback'
const api=await import('../fallback').catch(()=>({}) as typeof import('../fallback'))
const id='11111111-1111-4111-8111-111111111111'
function job():JobSnapshot{return {id,projectId:id,state:'reviewing',local:{startedCount:1,certainty:'completed'},stages:[],privacy:{dataClass:'synthetic',placement:'cloud_control_review_allowed',sourceApproved:true,containsSecrets:false,payloadExpiresAt:'2099-01-01T00:00:00.000Z'},stop:{globalClear:true,projectClear:true},budget:{authorized:true,pricingVerified:true,roleQualified:true,jobCapUsd:0.25,dailyCapUsd:5,dailyRemainingUsd:4,committedUsd:0,stageCeilingUsd:{local_review:0.02,cloud_task:0.01,cloud_review:0.02}}}}
it('maximum_one_local_and_three_cloud_calls',()=>{
 expect(typeof api.computeRemainingStages).toBe('function');const j=job();expect(api.computeRemainingStages(j)).toEqual(['local_review','cloud_task','cloud_review'])
 j.stages.push({stage:'local_review',state:'applied',verdict:'rejected',physicalCalls:1});expect(api.computeRemainingStages(j)).toEqual(['cloud_task','cloud_review'])
 j.stages.push({stage:'cloud_task',state:'applied',verdict:null,physicalCalls:1});expect(api.computeRemainingStages(j)).toEqual(['cloud_review'])
 j.stages.push({stage:'cloud_review',state:'applied',verdict:'rejected',physicalCalls:1});expect(api.computeRemainingStages(j)).toEqual([])
 const approved=job();approved.stages=[{stage:'local_review',state:'applied',verdict:'approved',physicalCalls:1}];expect(api.computeRemainingStages(approved)).toEqual([])
})
it('unknown_dispatch_never_falls_back',()=>{for(const j of [{...job(),local:{startedCount:1,certainty:'unknown' as const}},{...job(),stages:[{stage:'local_review' as const,state:'unknown' as const,verdict:null,physicalCalls:1}]},{...job(),stages:[{stage:'local_review' as const,state:'applied' as const,verdict:'unknown' as const,physicalCalls:1}]}])expect(api.computeRemainingStages(j)).toEqual([])})
it.each([
 ['state','unknown string'],['state','missing'],['state','null'],['state','array'],['state','boxed'],['state','coercing'],
 ['verdict','unknown string'],['verdict','missing'],['verdict','array'],['verdict','boxed'],['verdict','coercing'],
])('does not plan remaining stages for a %s represented by %s', (field,representation)=>{
 const literal=field==='state'?'pending':'approved'
 const convert=vi.fn(()=>literal)
 const value=representation==='unknown string'?'invented':representation==='missing'?undefined:representation==='null'?null:representation==='array'?[literal]:representation==='boxed'?new String(literal):{toString:convert}
 const j=job()
 j.stages=[{stage:'local_review',state:'pending',verdict:null,physicalCalls:0,[field]:value} as unknown as JobSnapshot['stages'][number]]
 expect(api.computeRemainingStages(j)).toEqual([])
 expect(convert).not.toHaveBeenCalled()
})
it.each(['pending','dispatching','response_ready'] as const)('retains worst-case reservation planning for supported %s state without granting execution',state=>{
 const j=job();j.stages=[{stage:'local_review',state,verdict:null,physicalCalls:state==='pending'?0:1}]
 expect(api.computeRemainingStages(j)).toEqual(['local_review','cloud_task','cloud_review'])
})
it('privacy_never_weakened',()=>{for(const patch of [{placement:'local_only'},{dataClass:'unknown'},{sourceApproved:false},{containsSecrets:true},{payloadExpiresAt:'2000-01-01T00:00:00.000Z'}])expect(api.computeRemainingStages({...job(),privacy:{...job().privacy,...patch}} as JobSnapshot)).toEqual([])})
it('review_cost_can_exceed_saved_task_cost',()=>{const out=api.summarizeLocalTextCost({localApiFeeUsd:0,localOperatingCostUsd:null,stages:[{stage:'local_review',apiCostUsd:0.02,usageRef:id}],avoidedCloudTaskEstimateUsd:0.001});expect(out.totalApiCostUsd).toBe(0.02);expect(out.totalOperatingCostUsd).toBeNull();expect(out.guaranteedSavings).toBe(false);expect(out.netApiSavingsEstimateUsd).toBeLessThan(0)})
it('cap_exhaustion_needs_input',()=>{for(const budget of [{authorized:false},{pricingVerified:false},{roleQualified:false},{jobCapUsd:0.01},{dailyRemainingUsd:0},{committedUsd:0.25}])expect(api.computeRemainingStages({...job(),budget:{...job().budget,...budget}})).toEqual([]);expect(api.computeRemainingStages({...job(),stop:{globalClear:false,projectClear:true}})).toEqual([])})
it('advance never exposes unreviewed or malformed private RPC output',async()=>{
 const {hashTask}=await import('@omnira/local-text-contract'),task={kind:'classify' as const,text:'Hjälp',labels:['support','annat']}
 const receipt={id,projectId:id,conversationId:id,state:'reviewing',reasonCode:null,result:{label:'support'},reviewStatus:'pending',selectionId:id,expiresAt:'2099-01-01T00:00:00.000Z',updatedAt:'2026-10-17T00:00:00.000Z'}
 const client=(value:unknown)=>({rpc:async()=>({data:{kind:'applied',value},error:null})}) as unknown as import('../types').Db
 const out=await api.advanceLocalText(client({receipt,task,inputHash:hashTask(task)}),id,new Date());expect(out.kind).toBe('applied');if(out.kind==='applied')expect(out.value.result).toBeNull()
 for(const value of [{receipt:{...receipt,state:'forged'},task,inputHash:hashTask(task)},{receipt:{...receipt,id:'22222222-2222-4222-8222-222222222222'},task,inputHash:hashTask(task)}])expect((await api.advanceLocalText(client(value),id,new Date())).kind).toBe('unknown')
})
