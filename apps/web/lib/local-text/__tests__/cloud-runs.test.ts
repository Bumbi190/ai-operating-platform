import {it,expect,vi,beforeEach} from 'vitest'
// Existing behavioral tests opt into a simulated post-incident-clearance gate;
// production hard-stop behavior is tested independently in activation-fence.test.ts.
vi.mock('../activation-fence',()=>({localTextDispatchEnabled:()=>process.env.ATLAS_LOCAL_TEXT_ENABLED==='true'}))
import {hashTask,canonicalJson,sha256} from '@omnira/local-text-contract'
import type {Db} from '../types'
import type {Run} from '@/lib/supabase/types'
const f=vi.hoisted(()=>({allowed:true,operations:[] as unknown[],finals:[] as unknown[],unknown:0,profile:null as null|Record<string,unknown>,profileReads:0,reviewCalls:0,sequence:[] as string[]}))
vi.mock('@/lib/governance/run-execution-checkpoint',()=>({checkpointClaimedRun:async()=>f.allowed?{allowed:true}:{allowed:false,refusal:'FENCED'},settleRefusal:vi.fn(),recordDispatchUnknown:async()=>{f.unknown++;return 'UNKNOWN_WRITTEN'},finalizeOwnedRunUnlessCancelled:async(...args:unknown[])=>{f.finals.push(args);f.sequence.push('finalize');return {outcome:'SUCCEEDED'}}}))
vi.mock('../cloud-profile',()=>({readCloudTextProfile:()=>{f.profileReads++;return f.profile}}))
vi.mock('../review',()=>({createGovernedReviewer:(v:any)=>{f.reviewCalls++;return v},reviewResult:async(v:any)=>({...v.binding,status:'approved',reasonCodes:[],createdAt:new Date().toISOString()}),reviewerFlight:()=> 'completed',REVIEWER_MODEL:'gpt-5.4-mini-2026-03-17'}))
const api=await import('../cloud-runs').catch(()=>({}) as typeof import('../cloud-runs'))
const id='11111111-1111-4111-8111-111111111111',task={kind:'classify' as const,text:'Hjälp',labels:['support','annat']},result={label:'support'}
const run={id,project_id:id,claim_id:id,kind:'local_text_cloud',workflow_id:null,workflow_instance_id:null} as Run
const snapshot={stageId:id,jobId:id,attemptId:id,projectId:id,stage:'local_review',state:'pending',reviewMode:'governed_openai',inputHash:hashTask(task),resultHash:sha256(canonicalJson(result)),task,result}
function db(state=snapshot){return {rpc:async(name:string,args:Record<string,unknown>)=>{f.operations.push({name,args});if(args.p_operation)f.sequence.push(String(args.p_operation));return {data:name==='local_text_cloud_snapshot'?{kind:'applied',value:state}:{kind:'applied',value:null},error:null}},from:()=>({select(){return this},eq(){return this},limit:async()=>({data:[{id}],error:null})})} as unknown as Db}
beforeEach(()=>{f.allowed=true;f.operations.length=0;f.finals.length=0;f.unknown=0;f.profile=null;f.profileReads=0;f.reviewCalls=0;f.sequence.length=0;vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true')})
it('no qualified reviewer queues human on an owned canonical run with no physical call',async()=>{expect(typeof api.executeLocalTextCloudRun).toBe('function');await api.executeLocalTextCloudRun(db(),run,id,new Date());expect(f.operations).toContainEqual(expect.objectContaining({args:expect.objectContaining({p_operation:'human',p_value:{reasonCode:'REVIEW_QUALIFICATION_REQUIRED'}})}));expect(f.finals[0]).toEqual(expect.arrayContaining([expect.objectContaining({status:'awaiting_approval'})]));expect(f.operations).toContainEqual(expect.objectContaining({args:expect.objectContaining({p_operation:'apply'})}))})
it('a reclaimed dispatching stage becomes unknown without retrying inference',async()=>{await api.executeLocalTextCloudRun(db({...snapshot,state:'dispatching'}),run,id,new Date());expect(f.unknown).toBe(1);expect(f.finals).toHaveLength(0);expect(f.operations).toContainEqual(expect.objectContaining({args:expect.objectContaining({p_operation:'unknown'})}))})
it('saved response recovers finalization only and foreign claim does nothing',async()=>{await api.executeLocalTextCloudRun(db({...snapshot,state:'response_ready'}),run,id,new Date());expect(f.finals).toHaveLength(1);expect(f.operations.some((x:any)=>x.args.p_operation==='dispatch')).toBe(false);f.operations.length=0;f.allowed=false;await api.executeLocalTextCloudRun(db(),run,id,new Date());expect(f.operations).toHaveLength(0)})
it('enqueue validates scoped hashes and preserves duplicate run identity',async()=>{const response={rpc:async()=>({data:{kind:'duplicate',value:{runId:id}},error:null})} as unknown as Db;expect(await api.enqueueCloudStage(response,{jobId:id,attemptId:id,stage:'local_review',inputHash:hashTask(task),resultHash:sha256(canonicalJson(result))})).toEqual({kind:'duplicate',value:{runId:id}})})

it('actual receipt is staged before canonical finalization and released only afterward',async()=>{f.profile={deployment:'gpt-5.4-mini-2026-03-17',qualificationHash:'a'.repeat(64),expiresAt:'2099-01-01T00:00:00.000Z',inputTokenUpperBound:8192,tokenBudgetVerified:true,pricingVerified:true,textEnvelopeEvidence:{model:'gpt-5.4-mini-2026-03-17'}};await api.executeLocalTextCloudRun(db({...snapshot,budgetReserved:true} as typeof snapshot),run,id,new Date());expect(f.reviewCalls).toBe(1);expect(f.sequence).toEqual(['dispatch','response','finalize','apply']);expect(f.operations).toContainEqual(expect.objectContaining({args:expect.objectContaining({p_operation:'response',p_value:{receipt:expect.objectContaining({usageRef:id,reviewRunId:id,reviewAttemptId:id,status:'approved'})}})}))})
it.each(['array','boxed','coercing'])('refuses a %s cloud stage before qualification or provider access',async representation=>{
 const convert=vi.fn(()=>'local_review'),stage=representation==='array'?['local_review']:representation==='boxed'?new String('local_review'):{toString:convert}
 await api.executeLocalTextCloudRun(db({...snapshot,stage} as unknown as typeof snapshot),run,id,new Date())
 expect(f.operations).toContainEqual(expect.objectContaining({args:expect.objectContaining({p_operation:'human',p_value:{reasonCode:'INVALID_STAGE'}})}))
 expect(f.profileReads).toBe(0);expect(f.reviewCalls).toBe(0);expect(convert).not.toHaveBeenCalled()
 expect(f.operations.some((x:any)=>x.args.p_operation==='dispatch')).toBe(false)
})
it.each(['missing','null','unknown','array','boxed','coercing'])('does not treat a %s review mode as governed provider permission',async representation=>{
 const convert=vi.fn(()=>'governed_openai')
 const reviewMode=representation==='missing'?undefined:representation==='null'?null:representation==='unknown'?'invented':representation==='array'?['governed_openai']:representation==='boxed'?new String('governed_openai'):{toString:convert}
 f.profile={deployment:'gpt-5.4-mini-2026-03-17',qualificationHash:'a'.repeat(64),expiresAt:'2099-01-01T00:00:00.000Z',inputTokenUpperBound:8192,tokenBudgetVerified:true,pricingVerified:true,textEnvelopeEvidence:{model:'gpt-5.4-mini-2026-03-17'}}
 await api.executeLocalTextCloudRun(db({...snapshot,reviewMode} as unknown as typeof snapshot),run,id,new Date())
 expect(f.operations).toContainEqual(expect.objectContaining({args:expect.objectContaining({p_operation:'human',p_value:{reasonCode:'INVALID_REVIEW_MODE'}})}))
 expect(f.profileReads).toBe(0);expect(f.reviewCalls).toBe(0);expect(convert).not.toHaveBeenCalled()
 expect(f.operations.some((x:any)=>x.args.p_operation==='dispatch')).toBe(false)
})
it.each(['local_review','cloud_task','cloud_review'])('preserves explicit human mode for %s without looking up provider qualification',async stage=>{
 await api.executeLocalTextCloudRun(db({...snapshot,stage,reviewMode:'human'}),run,id,new Date())
 expect(f.operations).toContainEqual(expect.objectContaining({args:expect.objectContaining({p_operation:'human',p_value:{reasonCode:stage==='cloud_task'?'HUMAN_MODE_NO_CLOUD_TASK':'HUMAN_REVIEW_REQUIRED'}})}))
 expect(f.profileReads).toBe(0);expect(f.reviewCalls).toBe(0)
 expect(f.operations.some((x:any)=>x.args.p_operation==='dispatch')).toBe(false)
})
