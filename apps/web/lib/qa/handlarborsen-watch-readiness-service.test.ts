import { describe,expect,it,vi } from 'vitest'
vi.mock('@/lib/project/get-project',()=>({getProjectBySlug:vi.fn()}))
import { createWatchReadinessService } from '@/lib/atlas/project-analytics/handlarborsen-watch-readiness-service'
import { HANDLARBORSEN_PROJECT_ID as id } from '@/lib/atlas/collectors/handlarborsen-marketplace'
const project={id,slug:'handlarborsen',name:'Handlarbörsen',owner_id:'owner-1'}
function fixture() {
  const row=(scope:string)=>({project_id:id,scope,limit_sek:'100',spent_sek:'10',held_sek:'2',remaining_sek:'88'})
  const budget=vi.fn(async()=>({data:['project_monthly','global_daily','global_weekly','global_monthly'].map(scope=>row(scope)),error:null}))
  const budgetFilter=vi.fn((_key:string,_value:string)=>budget())
  const projectRead=vi.fn(async()=>({data:project,error:null}))
  const chain:any={select:vi.fn(()=>chain),eq:vi.fn(()=>chain),maybeSingle:projectRead}
  const rpc=vi.fn((name:string,args:unknown)=>{
    if(name==='budget_headroom')return {eq:budgetFilter}
    if(name==='stop_state')return Promise.resolve({data:[{
      global_paused:false,global_paused_at:null,global_paused_reason:null,
      project_requested:true,project_found:true,project_paused:false,project_paused_at:null,project_paused_reason:null,
    }],error:null})
    throw Error('unexpected mutation RPC '+name)
  })
  const db:any={rpc,from:vi.fn(()=>chain)}
  const deps={
    ownerAccess:vi.fn(async():Promise<any>=>({ok:true,userId:'owner-1',allowedProjectIds:[id]})),
    project:vi.fn(async():Promise<any>=>project),admin:vi.fn(()=>db),
    collaboratorAccess:vi.fn(async():Promise<any>=>({ok:true,db})),
    enforced:vi.fn(()=>true),now:()=>new Date('2026-10-17T18:00:00Z'),
  }
  return {deps,db,rpc,chain,budget,budgetFilter,projectRead}
}
describe('project-bound read-only watch readiness service',()=>{
  it('reauthorizes owner and forwards only safe canonical stop/budget classifications',async()=>{
    const f=fixture(),result=await createWatchReadinessService(f.deps).load('owner')
    expect(result).toMatchObject({status:'ok',automaticActive:false,executionAllowed:false,budget:'available',enforcement:'enforced',globalStop:'clear',projectStop:'clear'})
    expect(f.budgetFilter).toHaveBeenCalledWith('project_id',id)
    expect(f.rpc.mock.calls.map(call=>call[0]).sort()).toEqual(['budget_headroom','stop_state'])
    expect(f.rpc).toHaveBeenCalledWith('stop_state',{p_project_id:id})
    expect(JSON.stringify(result)).not.toMatch(/owner-1|100|remaining_sek|global_paused_reason/)
  })
  it.each(['unauthorized','forbidden'] as const)('refuses %s owner before admin reads',async status=>{
    const f=fixture()
    f.deps.ownerAccess.mockResolvedValue(status==='unauthorized'?{ok:false}:{ok:true,userId:'owner-1',allowedProjectIds:[]})
    expect((await createWatchReadinessService(f.deps).load('owner')).status).toBe(status)
    expect(f.deps.admin).not.toHaveBeenCalled()
    expect(f.rpc).not.toHaveBeenCalled()
  })
  it('rejects a changed live owner before reading any control-plane state',async()=>{
    const f=fixture()
    f.projectRead.mockResolvedValue({data:{...project,owner_id:'other'},error:null})
    expect((await createWatchReadinessService(f.deps).load('owner')).status).toBe('forbidden')
    expect(f.rpc).not.toHaveBeenCalled()
  })
  it('uses the existing collaborator view grant and respects revocation',async()=>{
    const f=fixture(),service=createWatchReadinessService(f.deps)
    expect((await service.load('collaborator')).status).toBe('ok')
    expect(f.deps.collaboratorAccess).toHaveBeenCalledWith('view_competitors')
    expect(f.deps.ownerAccess).not.toHaveBeenCalled()
    f.rpc.mockClear()
    f.deps.collaboratorAccess.mockResolvedValue({ok:false,status:'forbidden'})
    expect((await service.load('collaborator')).status).toBe('forbidden')
    expect(f.rpc).not.toHaveBeenCalled()
  })
  it('refuses unknown audience without auth, database or external calls',async()=>{
    const f=fixture()
    expect((await createWatchReadinessService(f.deps).load('admin' as any)).status).toBe('forbidden')
    expect(f.deps.ownerAccess).not.toHaveBeenCalled()
    expect(f.deps.collaboratorAccess).not.toHaveBeenCalled()
  })
  it('keeps read errors unknown and a disabled enforcement flag advisory',async()=>{
    const f=fixture()
    f.budget.mockResolvedValue({data:null as any,error:{message:'private diagnostic'} as any})
    f.deps.enforced.mockReturnValue(false)
    const result=await createWatchReadinessService(f.deps).load('owner')
    expect(result).toMatchObject({status:'ok',budget:'unknown',enforcement:'advisory',executionAllowed:false})
    expect(JSON.stringify(result)).not.toContain('private diagnostic')
  })
  it('never confuses a failed stop read with unpaused automation',async()=>{
    const f=fixture()
    f.rpc.mockImplementation((name:string)=>{
      if(name==='stop_state')return Promise.resolve({data:null,error:{message:'synthetic stop read failed'}}) as any
      return {eq:f.budgetFilter}
    })
    const result=await createWatchReadinessService(f.deps).load('owner')
    expect(result).toMatchObject({globalStop:'unknown',projectStop:'unknown',executionAllowed:false})
  })
})
