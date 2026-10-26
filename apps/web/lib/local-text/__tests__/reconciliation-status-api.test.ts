import { beforeEach, describe, expect, it, vi } from 'vitest'
import { summarizeReconciliation } from '../reconciliation-readiness'

const ID = '11111111-1111-4111-8111-111111111111'
const mock = vi.hoisted(() => ({
  principal: { ok: true, userId: '11111111-1111-4111-8111-111111111111' } as Record<string,unknown>,
  ownerResult: { data: {kind:'applied',value:[{status:'revoked'}]}, error:null } as {data:unknown;error:unknown},
  ownersByProject: {} as Record<string,{data:unknown;error:unknown}>,
  ownerThrowsByProject: {} as Record<string,boolean>,
  rowsByProject: {} as Record<string,Record<string,Record<string,unknown>[]>>,
  failuresByProject: {} as Record<string,Record<string,'returned'|'thrown'>>,
  readPausesByProject: {} as Record<string,{table:string;wait:Promise<void>;entered:()=>void}>,
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
    rpc: async (...args:unknown[]) => {
      mock.rpcCalls.push(args)
      const projectId=(args[1] as Record<string,string>).p_project_id
      if(mock.ownerThrowsByProject[projectId]) throw new Error('private owner qualification failure')
      return mock.ownersByProject[projectId]??mock.ownerResult
    },
    from: (table:string) => ({
      select: (selection:string) => ({
        eq: (column:string,value:string) => ({
          limit: async (limit:number) => {
            mock.calls.push({table,select:selection,column,value,limit})
            const pause=mock.readPausesByProject[value]
            if(pause?.table===table) { pause.entered();await pause.wait }
            const failure=mock.failuresByProject[value]?.[table]
            if(failure==='thrown') throw new Error('private database failure')
            return {data:(mock.rowsByProject[value]??mock.rows)[table]??null,error:failure==='returned'||mock.failTable===table?new Error('private database failure'):null}
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
  mock.ownersByProject={};mock.rowsByProject={};mock.failuresByProject={}
  mock.ownerThrowsByProject={}
  mock.readPausesByProject={}
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
  it.each(['local_text_admissions','local_text_jobs'])('refuses partial inventory when %s returns rows with a read error',async table=>{
    mock.failTable=table
    const r=await inspect()
    expect(r.status).toBe(503)
    expect(r.data).toEqual({error:'LOCAL_TEXT_RECONCILIATION_READ_UNAVAILABLE'})
    expect(r.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it.each([
    ['devices','activeDevices'],
    ['local_text_incidents','openReconcile'],
    ['local_text_admissions','activeAdmissions'],
    ['local_text_jobs','retainedJobs'],
  ])('accepts exactly 100 %s rows and refuses an incomplete 101-row inventory',async (table,counter)=>{
    const rows=Array.from({length:101},(_,i)=>table==='devices' || table==='local_text_admissions'
      ? {status:'active'}
      : table==='local_text_incidents' ? {kind:'reconcile',state:'open',job_id:null}
      : {id:`${(i+1).toString(16).padStart(8,'0')}-2222-4222-8222-222222222222`})
    const setRows=(values:Record<string,unknown>[])=>{
      if(table==='devices') mock.ownerResult={data:{kind:'applied',value:values},error:null}
      else mock.rows[table]=values
    }
    setRows(rows.slice(0,100))
    const complete=await inspect()
    expect(complete.status).toBe(200)
    expect(complete.data.counts[counter]).toBe(100)
    expect(complete.data).toMatchObject({canRetry:false,canResume:false,canEnroll:false})
    setRows(rows)
    const truncated=await inspect()
    expect(truncated.status).toBe(503)
    expect(truncated.data).toEqual({error:'LOCAL_TEXT_RECONCILIATION_READ_UNAVAILABLE'})
  })
  it.each(['device','incident kind','incident state','admission array','unknown admission'])('refuses malformed %s evidence instead of returning trusted-looking counts',async field=>{
    if(field==='device') mock.ownerResult={data:{kind:'applied',value:[{status:['active']}]},error:null}
    if(field==='incident kind') mock.rows.local_text_incidents=[{kind:['reconcile'],state:'open',job_id:null}]
    if(field==='incident state') mock.rows.local_text_incidents=[{kind:'reconcile',state:['resolved'],job_id:null}]
    if(field==='admission array') mock.rows.local_text_admissions=[{status:['active']}]
    if(field==='unknown admission') mock.rows.local_text_admissions=[{status:'invented'}]
    const r=await inspect()
    expect(r.status).toBe(503)
    expect(r.data).toEqual({error:'LOCAL_TEXT_RECONCILIATION_READ_UNAVAILABLE'})
    expect(r.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it.each(['pending','active','paused','revoked'])('preserves the valid admission status %s',async status=>{
    mock.rows.local_text_admissions=[{status}]
    const r=await inspect()
    expect(r.status).toBe(200)
    expect(r.data.counts.activeAdmissions).toBe(status==='active'?1:0)
    expect(r.data).toMatchObject({status:'blocked',canRetry:false,canResume:false,canEnroll:false})
  })
  it('keeps concurrent same-owner project inventories separate without granting either project authority',async()=>{
    const healthy='22222222-2222-4222-8222-222222222222'
    mock.ownersByProject[healthy]={data:{kind:'applied',value:[{status:'active'}]},error:null}
    mock.rowsByProject[healthy]={
      local_text_incidents:[],local_text_admissions:[{status:'active'}],local_text_jobs:[],
    }
    const [affected,control]=await Promise.all([inspect(url(ID)),inspect(url(healthy))])
    expect(affected.status).toBe(200)
    expect(affected.data).toMatchObject({status:'blocked',counts:{openReconcile:1,openOffline:1,revokedDevices:1}})
    expect(control.status).toBe(200)
    expect(control.data).toMatchObject({
      status:'requires_new_admission_review',manualEvidenceRequired:true,
      canRetry:false,canResume:false,canEnroll:false,
      counts:{openReconcile:0,openOffline:0,otherOpen:0,revokedDevices:0,
        activeDevices:1,activeAdmissions:1,retainedJobs:0,openIncidentsWithoutRetainedJob:0},
    })
    expect(control.data.reasons).toEqual(['NEW_ADMISSION_AND_ATTESTATION_REQUIRED'])
    expect((await inspect(url(ID))).data).toEqual(affected.data)
    expect(mock.rpcCalls).toEqual([
      ['local_text_owner_devices',{p_owner_id:ID,p_project_id:ID}],
      ['local_text_owner_devices',{p_owner_id:ID,p_project_id:healthy}],
      ['local_text_owner_devices',{p_owner_id:ID,p_project_id:ID}],
    ])
    expect(mock.calls.filter(call=>call.value===healthy)).toHaveLength(3)
    expect(mock.calls.filter(call=>call.value===ID)).toHaveLength(6)
    for(const result of [affected,control]) {
      expect(JSON.stringify(result.data)).not.toContain(ID)
      expect(JSON.stringify(result.data)).not.toContain(healthy)
    }
  })
  it.each(['absent','unrelated','matching'])('keeps an open project incident blocked with two active devices and %s job history',async history=>{
    const healthy='22222222-2222-4222-8222-222222222222'
    const originalJob='33333333-3333-4333-8333-333333333333'
    const unrelatedJob='44444444-4444-4444-8444-444444444444'
    mock.ownerResult={data:{kind:'applied',value:[{status:'active'},{status:'active'}]},error:null}
    mock.rows.local_text_incidents=[{kind:'reconcile',state:'open',job_id:originalJob}]
    mock.rows.local_text_admissions=[{status:'active'},{status:'active'}]
    mock.rows.local_text_jobs=history==='absent'?[]:[{id:history==='matching'?originalJob:unrelatedJob}]
    mock.ownersByProject[healthy]={data:{kind:'applied',value:[{status:'active'}]},error:null}
    // Retention in B must not supply missing canonical history to A.
    mock.rowsByProject[healthy]={
      local_text_incidents:[],local_text_admissions:[{status:'active'}],local_text_jobs:[{id:originalJob}],
    }
    const before=JSON.stringify({rows:mock.rows,control:mock.rowsByProject,devices:mock.ownerResult})
    const [affected,control]=await Promise.all([inspect(url(ID)),inspect(url(healthy))])
    expect(affected.status).toBe(200)
    expect(affected.data).toMatchObject({
      status:'blocked',manualEvidenceRequired:true,canRetry:false,canResume:false,canEnroll:false,
      counts:{openReconcile:1,openOffline:0,otherOpen:0,revokedDevices:0,activeDevices:2,
        activeAdmissions:2,retainedJobs:history==='absent'?0:1,
        openIncidentsWithoutRetainedJob:history==='matching'?0:1},
    })
    expect(affected.data.reasons).toEqual(history==='matching'
      ? ['UNRESOLVED_DISPATCH_OUTCOME']
      : ['UNRESOLVED_DISPATCH_OUTCOME','CANONICAL_JOB_NOT_RETAINED'])
    expect(control.status).toBe(200)
    expect(control.data).toMatchObject({status:'requires_new_admission_review',
      canRetry:false,canResume:false,canEnroll:false,
      counts:{openReconcile:0,activeDevices:1,activeAdmissions:1,retainedJobs:1}})
    expect(control.data.reasons).toEqual(['NEW_ADMISSION_AND_ATTESTATION_REQUIRED'])
    expect((await inspect(url(ID))).data).toEqual(affected.data)
    expect(JSON.stringify({rows:mock.rows,control:mock.rowsByProject,devices:mock.ownerResult})).toBe(before)
    for(const result of [affected,control]) {
      for(const identifier of [ID,healthy,originalJob,unrelatedJob]) expect(JSON.stringify(result.data)).not.toContain(identifier)
    }
  })
  it.each([
    ['local_text_incidents','returned'],['local_text_incidents','thrown'],
    ['local_text_admissions','returned'],['local_text_admissions','thrown'],
    ['local_text_jobs','returned'],['local_text_jobs','thrown'],
  ] as const)('isolates a %s %s read failure from a concurrent healthy project',async (table,mode)=>{
    const healthy='22222222-2222-4222-8222-222222222222'
    mock.failuresByProject[ID]={[table]:mode}
    mock.ownersByProject[healthy]={data:{kind:'applied',value:[{status:'active'}]},error:null}
    mock.rowsByProject[healthy]={
      local_text_incidents:[],local_text_admissions:[{status:'active'}],local_text_jobs:[],
    }
    const [affected,control]=await Promise.all([inspect(url(ID)),inspect(url(healthy))])
    expect(affected.status).toBe(503)
    expect(affected.data).toEqual({error:'LOCAL_TEXT_RECONCILIATION_READ_UNAVAILABLE'})
    expect(affected.headers.get('Cache-Control')).toBe('private, no-store')
    expect(control.status).toBe(200)
    expect(control.data).toMatchObject({status:'requires_new_admission_review',manualEvidenceRequired:true,
      canRetry:false,canResume:false,canEnroll:false,
      counts:{openReconcile:0,openOffline:0,activeDevices:1,activeAdmissions:1}})
    expect(control.data.reasons).toEqual(['NEW_ADMISSION_AND_ATTESTATION_REQUIRED'])
    for(const project of [ID,healthy]) {
      const reads=mock.calls.filter(call=>call.value===project)
      expect(reads.map(call=>call.table).sort()).toEqual(['local_text_admissions','local_text_incidents','local_text_jobs'])
      expect(reads.every(call=>call.column==='project_id'&&call.limit===101)).toBe(true)
    }
    mock.failuresByProject={}
    const recovered=await inspect(url(ID))
    expect(recovered.status).toBe(200)
    expect(recovered.data).toMatchObject({status:'blocked',canRetry:false,canResume:false,canEnroll:false,
      counts:{openReconcile:1,openOffline:1}})
    expect((await inspect(url(healthy))).data).toEqual(control.data)
  })
  it.each(['valid','returned error','thrown error','malformed'] as const)('keeps a healthy project readable while the affected incident read is delayed then %s',async mode=>{
    const healthy='22222222-2222-4222-8222-222222222222'
    let release!:()=>void
    let entered!:()=>void
    const waiting=new Promise<void>(resolve=>{release=resolve})
    const started=new Promise<void>(resolve=>{entered=resolve})
    mock.readPausesByProject[ID]={table:'local_text_incidents',wait:waiting,entered}
    mock.ownersByProject[healthy]={data:{kind:'applied',value:[{status:'active'}]},error:null}
    mock.rowsByProject[healthy]={
      local_text_incidents:[],local_text_admissions:[{status:'active'}],local_text_jobs:[],
    }
    let affectedSettled=false
    const affected=inspect(url(ID)).then(result=>{affectedSettled=true;return result})
    let control:Awaited<ReturnType<typeof inspect>>
    try {
      await started
      control=await inspect(url(healthy))
      expect(affectedSettled).toBe(false)
      expect(control.status).toBe(200)
      expect(control.data).toMatchObject({status:'requires_new_admission_review',manualEvidenceRequired:true,
        canRetry:false,canResume:false,canEnroll:false,
        counts:{openReconcile:0,openOffline:0,activeDevices:1,activeAdmissions:1}})
      expect(control.data.reasons).toEqual(['NEW_ADMISSION_AND_ATTESTATION_REQUIRED'])
      if(mode==='returned error') mock.failuresByProject[ID]={local_text_incidents:'returned'}
      if(mode==='thrown error') mock.failuresByProject[ID]={local_text_incidents:'thrown'}
      if(mode==='malformed') mock.rows.local_text_incidents=[{kind:'reconcile',state:['open'],job_id:null}]
    } finally {
      release()
      // Drain A even if B/assertions fail, before the next test resets shared fixtures.
      // A's result is asserted below; cleanup must preserve an earlier failure.
      await affected.then(()=>undefined,()=>undefined)
    }
    const delayed=await affected
    if(mode==='valid') {
      expect(delayed.status).toBe(200)
      expect(delayed.data).toMatchObject({status:'blocked',manualEvidenceRequired:true,
        canRetry:false,canResume:false,canEnroll:false,counts:{openReconcile:1,openOffline:1}})
    } else {
      expect(delayed.status).toBe(503)
      expect(delayed.data).toEqual({error:'LOCAL_TEXT_RECONCILIATION_READ_UNAVAILABLE'})
    }
    for(const result of [delayed,control]) {
      expect(result.headers.get('Cache-Control')).toBe('private, no-store')
      expect(JSON.stringify(result.data)).not.toContain(ID)
      expect(JSON.stringify(result.data)).not.toContain(healthy)
      expect(JSON.stringify(result.data)).not.toContain('private database failure')
    }
    // The delayed success/error must not replace or poison B's next response.
    expect((await inspect(url(healthy))).data).toEqual(control.data)
    for(const project of [ID,healthy]) {
      const reads=mock.calls.filter(call=>call.value===project)
      expect(reads).toHaveLength(project===ID?3:6)
      expect(reads.every(call=>call.column==='project_id'&&call.limit===101)).toBe(true)
    }
    expect(mock.rpcCalls).toEqual([
      ['local_text_owner_devices',{p_owner_id:ID,p_project_id:ID}],
      ['local_text_owner_devices',{p_owner_id:ID,p_project_id:healthy}],
      ['local_text_owner_devices',{p_owner_id:ID,p_project_id:healthy}],
    ])
  })
  it.each(['returned error','thrown error','refused','malformed'] as const)('stops before inventory reads on %s owner qualification while a healthy project remains readable',async mode=>{
    const healthy='22222222-2222-4222-8222-222222222222'
    const owner='55555555-5555-4555-8555-555555555555'
    mock.principal={ok:true,userId:owner}
    if(mode==='returned error') mock.ownersByProject[ID]={data:{kind:'applied',value:[{status:'active'}]},error:new Error('private owner qualification failure')}
    if(mode==='thrown error') mock.ownerThrowsByProject[ID]=true
    if(mode==='refused') mock.ownersByProject[ID]={data:{kind:'refused',reason:'SCOPE_REFUSED',value:[{status:'active'}]},error:null}
    if(mode==='malformed') mock.ownersByProject[ID]={data:{kind:'applied',value:{status:'active'}},error:null}
    mock.ownersByProject[healthy]={data:{kind:'applied',value:[{status:'active'}]},error:null}
    mock.rowsByProject[healthy]={
      local_text_incidents:[],local_text_admissions:[{status:'active'}],local_text_jobs:[],
    }
    const [denied,control]=await Promise.all([inspect(url(ID)),inspect(url(healthy))])
    const unavailable=mode==='returned error'||mode==='thrown error'
    expect(denied.status).toBe(unavailable?503:404)
    expect(denied.data).toEqual({error:unavailable?'LOCAL_TEXT_RECONCILIATION_READ_UNAVAILABLE':'NOT_FOUND'})
    expect(denied.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mock.calls.filter(call=>call.value===ID)).toEqual([])
    expect(mock.calls).toHaveLength(3)
    expect(mock.calls.every(call=>call.value===healthy&&call.column==='project_id'&&call.limit===101)).toBe(true)
    expect(mock.rpcCalls).toEqual([
      ['local_text_owner_devices',{p_owner_id:owner,p_project_id:ID}],
      ['local_text_owner_devices',{p_owner_id:owner,p_project_id:healthy}],
    ])
    expect(control.status).toBe(200)
    expect(control.data).toMatchObject({status:'requires_new_admission_review',manualEvidenceRequired:true,
      canRetry:false,canResume:false,canEnroll:false,counts:{openReconcile:0,activeDevices:1,activeAdmissions:1}})
    expect(control.data.reasons).toEqual(['NEW_ADMISSION_AND_ATTESTATION_REQUIRED'])
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
