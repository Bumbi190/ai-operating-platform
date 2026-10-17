import {beforeEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({authority:vi.fn(),client:vi.fn(),rpc:vi.fn()}))
vi.mock('@/lib/atlas/handlarborsen-test-data/authority',()=>({resolveCleanupOperator:m.authority}))
vi.mock('@/lib/atlas/handlarborsen-test-data/client',()=>({callHandlarborsenTestData:m.client}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc})}))
import {dispatchApprovedCleanup} from '@/lib/atlas/handlarborsen-test-data/service'
const projectId='8f673c09-1c8f-4d78-876e-4c14bf1c89b3',conversationId='11000000-0000-4000-8000-000000000001',packageId='22000000-0000-4000-8000-000000000001',executionId='33000000-0000-4000-8000-000000000001',binding='44000000-0000-4000-8000-000000000001'
const p={userId:'55000000-0000-4000-8000-000000000001',projectId,conversationId,operatorBindingId:binding,allowedOperations:['quarantine']}
const pkg={packageId,projectId,conversationId,operatorBindingId:binding,operation:'quarantine',organisationIds:['66000000-0000-4000-8000-000000000001'],classificationRevision:'a'.repeat(64),graphSha256:'b'.repeat(64),expiresAt:'2099-01-01T00:00:00Z',counts:{organizations:1},blockers:[],status:'prepared'}
const job={packageId,executionId,approvalRef:'77000000-0000-4000-8000-000000000001',idempotencyKey:executionId,packageView:pkg,state:'dispatching',dispatch:true}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('ATLAS_TEST_DATA_MUTATIONS_ENABLED','true');m.authority.mockResolvedValue({ok:true,principal:p});m.rpc.mockImplementation((name:string)=>Promise.resolve({data:name.endsWith('_claim')?job:true,error:null}));m.client.mockResolvedValue({status:'unknown',executionId})})
it('persists and claims before dispatch, then timeout_only_reads_existing_receipt',async()=>{
 expect(await dispatchApprovedCleanup(packageId,{projectId,conversationId})).toEqual({status:'unknown',executionId})
 expect(m.rpc.mock.calls[0][0]).toBe('handlarborsen_test_data_claim')
 expect(m.client.mock.calls[0][0]).toMatchObject({action:'execute',payload:{executionId,packageId}})
 m.rpc.mockImplementation((name:string)=>Promise.resolve({data:name.endsWith('_claim')?{...job,dispatch:false,state:'unknown'}:true,error:null}))
 m.client.mockResolvedValue({status:'ok',action:'receipt',data:null})
 expect(await dispatchApprovedCleanup(packageId,{projectId,conversationId})).toEqual({status:'unknown',executionId})
 expect(m.client.mock.calls.map(c=>c[0].action)).toEqual(['execute','receipt'])
 expect(m.client.mock.calls[1][0]).toEqual({action:'receipt',payload:{executionId}})
})
it('no fresh authority means zero upstream calls',async()=>{m.authority.mockResolvedValue({ok:false,reason:'forbidden'});expect(await dispatchApprovedCleanup(packageId,{projectId,conversationId})).toEqual({status:'denied'});expect(m.client).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled()})
it('never trusts a model confirmation or an absent durable human decision',async()=>{m.rpc.mockResolvedValue({data:null,error:null});expect(await dispatchApprovedCleanup(packageId,{projectId,conversationId})).toEqual({status:'needs_new_review'});expect(m.client).not.toHaveBeenCalled()})
it('does not dispatch a malformed or foreign durable package',async()=>{m.rpc.mockResolvedValue({data:{...job,packageView:{...pkg,conversationId:binding}},error:null});expect(await dispatchApprovedCleanup(packageId,{projectId,conversationId})).toEqual({status:'unavailable'});expect(m.client).not.toHaveBeenCalled()})
it('does not claim when the mutation flag is disabled',async()=>{vi.stubEnv('ATLAS_TEST_DATA_MUTATIONS_ENABLED','false');expect(await dispatchApprovedCleanup(packageId,{projectId,conversationId})).toEqual({status:'disabled'});expect(m.rpc).not.toHaveBeenCalled()})
it('only reports success after persisting an exact durable receipt',async()=>{const receipt={packageId,executionId,operation:'quarantine',outcome:'applied',beforeSha256:'a'.repeat(64),afterSha256:'b'.repeat(64),counts:{organizations:1},committedAt:'2026-10-17T12:00:00Z'};m.client.mockResolvedValue({status:'ok',action:'execute',data:receipt});m.rpc.mockImplementation((name:string)=>Promise.resolve({data:name.endsWith('_claim')?job:false,error:null}));expect(await dispatchApprovedCleanup(packageId,{projectId,conversationId})).toEqual({status:'unknown',executionId})})
