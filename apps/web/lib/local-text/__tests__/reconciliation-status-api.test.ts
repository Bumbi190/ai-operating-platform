import { beforeEach, describe, expect, it, vi } from 'vitest'
import { summarizeReconciliation } from '../reconciliation-readiness'

const ID = '11111111-1111-4111-8111-111111111111'
const mock = vi.hoisted(() => ({
  principal: { ok: true, userId: '11111111-1111-4111-8111-111111111111' } as Record<string,unknown>,
  ownerResult: { data: {kind:'applied',value:[{status:'revoked'}]}, error:null } as {data:unknown;error:unknown},
  calls: [] as {table:string;select?:string;column?:string;value?:string;limit?:number}[],
  rows: {
    local_text_incidents: [
      {kind:'reconcile',state:'open',job_id:null},
      {kind:'offline',state:'open',job_id:null},
    ] as Record<string,unknown>[],
    local_text_admissions: [{status:'revoked'}] as Record<string,unknown>[],
    local_text_jobs: [] as Record<string,unknown>[],
  } as Record<string,Record<string,unknown>[]>,
  failTable: '' as string,
  rpcCalls: [] as unknown[][],
}))
vi.mock('@/lib/auth/platform-operator',()=>({
  resolvePlatformOperator: async () => mock.principal,
}))
vi.mock('@/lib/supabase/admin',()=>({
  createAdminClient: () => ({
    rpc: async (...args:unknown[]) => {mock.rpcCalls.push(args);return mock.ownerResult},
    from: (table:string) => ({
      select: (selection:string) => ({
        eq: (column:string,value:string) => ({
          limit: async (limit:number) => {
            mock.calls.push({table,select:selection,column,value,limit})
            return {data:mock.rows[table]??null,error:mock.failTable===table?new Error('private database failure'):null}
          },
        }),
      }),
    }),
  }),
}))

import { getLocalReconciliationStatus } from '../reconciliation-status-api'
const url=(projectId=ID)=>new Request('https://omnira.test/api/local-text/reconciliation-status?projectId='+projectId)
async function inspect(request=url()) {
  const response = await getLocalReconciliationStatus(request)
  return {status:response.status,data:await response.json(),headers:response.headers}
}

beforeEach(()=>{
  mock.principal={ok:true,userId:ID}
  mock.ownerResult={data:{kind:'applied',value:[{status:'revoked'}]},error:null}
  mock.calls.length=0;mock.rpcCalls.length=0;mock.failTable=''
  mock.rows.local_text_incidents=[
    {kind:'reconcile',state:'open',job_id:null},
    {kind:'offline',state:'open',job_id:null},
  ]
  mock.rows.local_text_admissions=[{status:'revoked'}]
  mock.rows.local_text_jobs=[]
})

describe('read-only, owner-scoped local text reconciliation status',()=>{
  it('reports the exact production-class failure without exposing IDs or granting retry',async()=>{
    const r=await inspect()
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({
      status:'blocked',manualEvidenceRequired:true,canRetry:false,canResume:false,canEnroll:false,
      counts:{openReconcile:1,openOffline:1,revokedDevices:1,activeAdmissions:0,
        retainedJobs:0,openIncidentsWithoutRetainedJob:2},
    })
    expect(r.data.reasons).toEqual(expect.arrayContaining([
      'UNRESOLVED_DISPATCH_OUTCOME','OPEN_OFFLINE_INCIDENT','CANONICAL_JOB_NOT_RETAINED',
      'REVOKED_DEVICE','NO_ACTIVE_DEVICE_ADMISSION',
    ]))
    const serialized=JSON.stringify(r.data)
    expect(serialized).not.toContain(ID)
    expect(serialized).not.toContain('secret')
    expect(r.headers.get('Cache-Control')).toBe('private, no-store')
    expect(r.headers.get('X-Robots-Tag')).toContain('noindex')
    expect(mock.rpcCalls).toEqual([['local_text_owner_devices',{p_owner_id:ID,p_project_id:ID}]])
    expect(mock.calls).toHaveLength(3)
    for(const call of mock.calls) {
      expect(call.value).toBe(ID)
      expect(call.column).toBe('project_id')
      expect(call.limit).toBe(101)
    }
  })
  it('denies unauthenticated and non-operator callers before touching database',async()=>{
    mock.principal={ok:false,reason:'unauthenticated'}
    expect((await inspect()).status).toBe(401)
    mock.principal={ok:false,reason:'not_platform_operator'}
    expect((await inspect()).status).toBe(403)
    mock.principal={ok:false,reason:'no_operator_configured'}
    expect((await inspect()).status).toBe(503)
    expect(mock.rpcCalls).toHaveLength(0)
    expect(mock.calls).toHaveLength(0)
  })
  it('rejects malformed, duplicate and additional query parameters',async()=>{
    for(const request of [
      url('not-uuid'),
      new Request('https://omnira.test/api/local-text/reconciliation-status'),
      new Request('https://omnira.test/api/local-text/reconciliation-status?projectId='+ID+'&debug=1'),
      new Request('https://omnira.test/api/local-text/reconciliation-status?projectId='+ID+'&projectId='+ID),
    ]) expect((await inspect(request)).status).toBe(400)
    expect(mock.rpcCalls).toHaveLength(0)
    expect(mock.calls).toHaveLength(0)
  })
  it('uses the existing service-role owner-bound RPC and refuses cross-project access',async()=>{
    mock.ownerResult={data:{kind:'refused',reason:'SCOPE_REFUSED'},error:null}
    expect((await inspect()).status).toBe(404)
    expect(mock.calls).toHaveLength(0)
    expect(mock.rpcCalls).toHaveLength(1)
  })
  it('fails closed on RPC or read errors, truncated datasets and untrusted status',async()=>{
    mock.ownerResult={data:null,error:Error('backend unavailable')}
    expect((await inspect()).status).toBe(503)
    mock.ownerResult={data:{kind:'applied',value:[{status:'active'}]},error:null}
    mock.failTable='local_text_incidents'
    expect((await inspect()).status).toBe(503)
    mock.failTable=''
    mock.rows.local_text_incidents=Array.from({length:101},()=>({kind:'reconcile',state:'open',job_id:null}))
    expect((await inspect()).status).toBe(503)
    mock.rows.local_text_incidents=[{kind:'reconcile',state:'invented',job_id:null}]
    expect((await inspect()).status).toBe(503)
  })
  it('returns a review-required state even with no open incidents',async()=>{
    mock.ownerResult={data:{kind:'applied',value:[{status:'active'}]},error:null}
    mock.rows.local_text_incidents=[]
    mock.rows.local_text_admissions=[{status:'active'}]
    mock.rows.local_text_jobs=[]
    const r=await inspect()
    expect(r.status).toBe(200)
    expect(r.data.status).toBe('requires_new_admission_review')
    expect(r.data.canRetry).toBe(false)
    expect(r.data.canResume).toBe(false)
    expect(r.data.canEnroll).toBe(false)
  })
  it('is a bounded GET without write operations',async()=>{
    const response=await getLocalReconciliationStatus(new Request(url().url,{method:'POST'}))
    expect(response.status).toBe(405)
    expect(mock.rpcCalls).toHaveLength(0)
    expect(mock.calls).toHaveLength(0)
  })
})

describe('reconciliation state cannot be invented from incomplete evidence',()=>{
  const empty={openReconcile:0,openOffline:0,otherOpen:0,revokedDevices:0,activeDevices:0,
    activeAdmissions:0,retainedJobs:0,openIncidentsWithoutRetainedJob:0}
  it('never authorizes retry/resume or enrollment from a clean-looking inventory',()=>{
    expect(summarizeReconciliation(empty)).toMatchObject({
      status:'requires_new_admission_review',canRetry:false,canResume:false,canEnroll:false,
      manualEvidenceRequired:true,
    })
  })
  it('refuses negative counts, mismatched missing-job counts and overflow',()=>{
    expect(()=>summarizeReconciliation({...empty,openReconcile:-1})).toThrow()
    expect(()=>summarizeReconciliation({...empty,openIncidentsWithoutRetainedJob:1})).toThrow()
    expect(()=>summarizeReconciliation({...empty,retainedJobs:Number.MAX_SAFE_INTEGER})).toThrow()
  })
})
