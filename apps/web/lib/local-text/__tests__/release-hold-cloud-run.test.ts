import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashTask,canonicalJson,sha256 } from '@omnira/local-text-contract'
import type { Run } from '@/lib/supabase/types'
import type { Db } from '../types'

// Real runner and real hold; every persisted operation below is an in-memory
// adapter observation. Provider boundaries must never be reached.
const f=vi.hoisted(()=>({
  sequence:[] as string[],allowed:true,humanApplied:true,finalized:true,applyKind:'applied' as unknown,
  checkpoint:vi.fn(),finalize:vi.fn(),advance:vi.fn(),
  profile:vi.fn(()=>{throw new Error('unexpected profile lookup')}),
  reviewer:vi.fn(()=>{throw new Error('unexpected reviewer creation')}),
  review:vi.fn(()=>{throw new Error('unexpected review execution')}),
  flight:vi.fn(()=>{throw new Error('unexpected reviewer flight lookup')}),
  task:vi.fn(()=>{throw new Error('unexpected cloud task execution')}),
  unknown:vi.fn(()=>{throw new Error('unexpected unknown-outcome mutation')}),
  settle:vi.fn(()=>{throw new Error('unexpected refusal settlement')}),
  from:vi.fn(()=>{throw new Error('unexpected table query')}),
}))
vi.mock('@/lib/governance/run-execution-checkpoint',()=>({
  checkpointClaimedRun:f.checkpoint,finalizeOwnedRunUnlessCancelled:f.finalize,
  recordDispatchUnknown:f.unknown,settleRefusal:f.settle,
}))
vi.mock('../cloud-profile',()=>({readCloudTextProfile:f.profile}))
vi.mock('../review',()=>({createGovernedReviewer:f.reviewer,reviewResult:f.review,reviewerFlight:f.flight}))
vi.mock('../cloud-task',()=>({executeCloudTextTask:f.task}))
vi.mock('../fallback',()=>({advanceLocalText:f.advance}))
import { executeLocalTextCloudRun } from '../cloud-runs'
import { LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD } from '../activation-fence'

const id='11111111-1111-4111-8111-111111111111'
const now=new Date('2026-10-24T12:00:00.000Z')
const run={id,project_id:id,claim_id:id,kind:'local_text_cloud',workflow_id:null,workflow_instance_id:null} as Run
const task={kind:'classify' as const,text:'Synthetic hold test',labels:['one','two']}
const result={label:'one'}
const stages=['local_review','cloud_task','cloud_review'] as const
function fixture(stage:typeof stages[number],patch:Record<string,unknown>={}) {
  const snapshot={stageId:id,jobId:id,attemptId:id,projectId:id,stage,state:'pending',
    reviewMode:'governed_openai',budgetReserved:true,task,result,
    inputHash:hashTask(task),resultHash:stage==='cloud_task'?null:sha256(canonicalJson(result)),...patch}
  const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
    if(name==='local_text_cloud_snapshot') {
      expect(args).toEqual({p_run_id:id,p_claim_id:id})
      f.sequence.push('snapshot')
      return {data:{kind:'applied',value:snapshot},error:null}
    }
    expect(name).toBe('local_text_cloud_operation')
    expect(args.p_run_id).toBe(id)
    expect(args.p_claim_id).toBe(id)
    if(args.p_operation==='human') {
      expect(args.p_value).toEqual({reasonCode:'LOCAL_TEXT_DISABLED'})
      f.sequence.push('human')
      return {data:f.humanApplied?{kind:'applied'}:{kind:'refused',reason:'FENCED'},error:null}
    }
    expect(args.p_operation).toBe('apply')
    expect(args.p_value).toEqual({})
    f.sequence.push('apply')
    return {data:{kind:f.applyKind},error:null}
  })
  return {db:{rpc,from:f.from} as unknown as Db,rpc}
}
beforeEach(()=>{
  vi.clearAllMocks();f.sequence=[];f.allowed=true;f.humanApplied=true;f.finalized=true;f.applyKind='applied'
  vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true')
  expect(LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD).toBe(true)
  f.checkpoint.mockImplementation(async()=>{f.sequence.push('checkpoint');return f.allowed?{allowed:true}:{allowed:false,refusal:'FENCED'}})
  f.finalize.mockImplementation(async()=>{f.sequence.push('finalize');return {outcome:f.finalized?'SUCCEEDED':'FENCED'}})
  f.advance.mockImplementation(async()=>{f.sequence.push('advance')})
})
afterEach(()=>{
  vi.unstubAllEnvs()
  for(const spy of [f.profile,f.reviewer,f.review,f.flight,f.task,f.unknown,f.settle,f.from]) expect(spy).not.toHaveBeenCalled()
})
describe('pending cloud stages under the real unresolved-incident hold',()=>{
  it.each(['pending','response_ready','human_ready'].flatMap(state=>
    ['array job','coercing job','stage','attempt','project'].map(binding=>({state,binding}))))('rejects $binding snapshot binding before $state continuation',async ({state,binding})=>{
    const convert=vi.fn(()=>id)
    const patches:Record<string,Record<string,unknown>>={
      'array job':{jobId:[id]},'coercing job':{jobId:{toString:convert}},
      stage:{stageId:0},attempt:{attemptId:null},project:{projectId:'22222222-2222-4222-8222-222222222222'},
    }
    const patch=patches[binding]
    const {db,rpc}=fixture('local_review',{state,...patch})
    await executeLocalTextCloudRun(db,run,id,now)
    expect(f.sequence).toEqual(['checkpoint','snapshot','finalize'])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(f.finalize).toHaveBeenCalledWith(db,id,id,{
      status:'failed',error:'LOCAL_TEXT_SOURCE_UNAVAILABLE',finished_at:now.toISOString(),claimed_at:null,lease_until:null,
    })
    expect(f.advance).not.toHaveBeenCalled();expect(convert).not.toHaveBeenCalled()
  })
  it.each(['response_ready','human_ready'])('preserves valid saved %s handling without provider access',async state=>{
    const {db}=fixture('local_review',{state})
    await executeLocalTextCloudRun(db,run,id,now)
    expect(f.sequence).toEqual(['checkpoint','snapshot','finalize','apply','advance'])
    expect(f.finalize).toHaveBeenCalledWith(db,id,id,{
      status:state==='human_ready'?'awaiting_approval':'done',context:{localText:{jobId:id,stageId:id}},
      finished_at:now.toISOString(),claimed_at:null,lease_until:null,
    })
    expect(f.advance).toHaveBeenCalledWith(db,id,expect.any(Date))
  })
  it.each(['array','boxed','coercing'])('does not advance after a %s apply result kind',async representation=>{
    const convert=vi.fn(()=>'applied')
    f.applyKind=representation==='array'?['applied']:representation==='boxed'?new String('applied'):{toString:convert}
    await expect(executeLocalTextCloudRun(fixture('local_review').db,run,id,now)).rejects.toThrow('LOCAL_TEXT_APPLY_PENDING')
    expect(f.sequence).toEqual(['checkpoint','snapshot','human','finalize','apply'])
    expect(f.advance).not.toHaveBeenCalled();expect(convert).not.toHaveBeenCalled()
  })
  it('preserves a primitive duplicate apply result without provider dispatch',async()=>{
    f.applyKind='duplicate'
    await executeLocalTextCloudRun(fixture('local_review').db,run,id,now)
    expect(f.sequence).toEqual(['checkpoint','snapshot','human','finalize','apply','advance'])
  })
  it.each(stages)('routes pending %s to human review without dispatch',async stage=>{
    const {db}=fixture(stage)
    await executeLocalTextCloudRun(db,run,id,now)
    expect(f.sequence).toEqual(['checkpoint','snapshot','human','finalize','apply','advance'])
    expect(f.checkpoint).toHaveBeenCalledWith(db,{runId:id,projectId:id,claimId:id,boundary:'local_text:cloud'})
    expect(f.finalize).toHaveBeenCalledTimes(1)
    expect(f.finalize).toHaveBeenCalledWith(db,id,id,{
      status:'awaiting_approval',context:{localText:{jobId:id,stageId:id,reasonCode:'LOCAL_TEXT_DISABLED'}},
      finished_at:now.toISOString(),claimed_at:null,lease_until:null,
    })
    expect(f.advance).toHaveBeenCalledWith(db,id,expect.any(Date))
  })
  it.each(stages)('does not finalize or apply %s after the human transition is refused',async stage=>{
    f.humanApplied=false
    await executeLocalTextCloudRun(fixture(stage).db,run,id,now)
    expect(f.sequence).toEqual(['checkpoint','snapshot','human'])
    expect(f.finalize).not.toHaveBeenCalled();expect(f.advance).not.toHaveBeenCalled()
  })
  it.each(stages)('does not apply %s after finalization loses authority',async stage=>{
    f.finalized=false
    await executeLocalTextCloudRun(fixture(stage).db,run,id,now)
    expect(f.sequence).toEqual(['checkpoint','snapshot','human','finalize'])
    expect(f.advance).not.toHaveBeenCalled()
  })
  it('does not read a snapshot after the entry checkpoint is fenced',async()=>{
    f.allowed=false
    const {db,rpc}=fixture('cloud_task')
    await executeLocalTextCloudRun(db,run,id,now)
    expect(f.sequence).toEqual(['checkpoint'])
    expect(rpc).not.toHaveBeenCalled();expect(f.finalize).not.toHaveBeenCalled();expect(f.advance).not.toHaveBeenCalled()
  })
})
