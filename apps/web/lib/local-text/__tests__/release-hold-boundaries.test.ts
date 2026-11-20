import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WORKER_OPERATIONS } from '@omnira/local-text-contract'

// Exercise real entry points and the real source-controlled hold. Only external
// boundaries are mocked; reaching one fails the no-side-effect assertions.
const external=vi.hoisted(()=>{
 const rpc=vi.fn(()=>{throw new Error('unexpected database RPC')})
 const from=vi.fn(()=>{throw new Error('unexpected database query')})
 return {
  admin:vi.fn(()=>({rpc,from})),rpc,from,
  worker:vi.fn(()=>{throw new Error('unexpected worker execution')}),
  enqueue:vi.fn(()=>{throw new Error('unexpected job request')}),
  admission:vi.fn(()=>{throw new Error('unexpected admission write')}),
  receipt:vi.fn(()=>{throw new Error('unexpected receipt read')}),
  scope:vi.fn(()=>{throw new Error('unexpected project inventory')}),
  profile:vi.fn(()=>{throw new Error('unexpected qualification read')}),
}})
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:external.admin}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:async()=>({ok:true,userId:'11111111-1111-4111-8111-111111111111'})}))
vi.mock('@/lib/atlas/isolation',()=>({getAllowedProjectIds:external.scope}))
vi.mock('../worker-api',()=>({executeWorkerRequest:external.worker}))
vi.mock('../request',()=>({requestLocalTextJob:external.enqueue}))
vi.mock('../store',()=>({writeOwnerAdmission:external.admission,readReceipt:external.receipt}))
vi.mock('../cloud-profile',()=>({readCloudTextProfile:external.profile}))

import { LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD } from '../activation-fence'
import { POST } from '@/app/api/local-text/worker/[operation]/route'
import { handleOwnerDeviceRequest } from '../owner-api'
import { handleOwnerAdmissionRequest } from '../admission-api'
import { handleCloudBudgetRequest } from '../budget-api'
import { handleLocalTextPilotRequest } from '../pilot-api'
import { availableLocalTextTools,handleLocalTextTool } from '../atlas-tools'
import type { Db } from '../types'

const id='11111111-1111-4111-8111-111111111111'
let expectedClientCreations=0
const request=(body:unknown={},method='POST')=>new Request('https://omnira.test/api/local-text/test',{
  method,headers:{origin:'https://omnira.test','content-type':'application/json'},body:JSON.stringify(body),
})
beforeEach(()=>{
  vi.clearAllMocks()
  expectedClientCreations=0
  vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED','true')
  vi.stubEnv('ATLAS_LOCAL_TEXT_PILOT_PROJECT_ID',id)
  expect(LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD).toBe(true)
})
afterEach(()=>{
  vi.unstubAllEnvs()
  expect(external.admin).toHaveBeenCalledTimes(expectedClientCreations)
  for(const [name,spy] of Object.entries(external)) if(name!=='admin') expect(spy).not.toHaveBeenCalled()
})

describe('real source release hold at dispatch and approval entry points',()=>{
  it.each(WORKER_OPERATIONS)('denies signed-worker operation %s before database or worker access',async operation=>{
    const response=await POST(request(),{params:{operation}})
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({error:'LOCAL_TEXT_DISABLED'})
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
  it.each(['register','approve'])('denies device %s',async action=>{
    // PATCH creates an inert client before distinguishing approval/revocation.
    // Its RPC/query methods must still remain untouched.
    expectedClientCreations=action==='approve'?1:0
    const response=await handleOwnerDeviceRequest(request({projectId:id,action:'approve',expectedVersion:1,confirmFingerprint:'a'.repeat(64)},action==='register'?'POST':'PATCH'),action==='register'?undefined:id)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({error:'LOCAL_TEXT_UNAVAILABLE'})
  })
  it('denies admission creation before qualification or storage',async()=>{
    const response=await handleOwnerAdmissionRequest(request({action:'admit',projectId:id}),id)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({error:'LOCAL_TEXT_UNAVAILABLE'})
  })
  it('denies cloud-budget authorization before profile or storage',async()=>{
    const response=await handleCloudBudgetRequest(request({action:'authorize',projectId:id}),id)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({error:'LOCAL_TEXT_UNAVAILABLE'})
  })
  it('denies the direct pilot even with the pilot project and feature flag set',async()=>{
    const response=await handleLocalTextPilotRequest(request({projectId:id,conversationId:id,idempotencyKey:id}))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({error:'LOCAL_TEXT_DISABLED'})
  })
  it('advertises no local-text tools in an otherwise eligible text context',()=>{
    expect(availableLocalTextTools({inputSource:'text',studio:false,fast:false,staticConversation:false})).toEqual([])
  })
  it('denies direct tool invocation before enqueueing a job',async()=>{
    const db={rpc:external.admin,from:external.admin} as unknown as Db
    expect(await handleLocalTextTool('request_local_text_job',{
      projectId:id,idempotencyKey:id,task:{kind:'summarize',text:'Synthetic hold check'},
    },{userId:id,allowedProjectIds:[id]},id,db,'text')).toEqual({error:'LOCAL_TEXT_DISABLED',availability:'needs_input'})
  })
})
