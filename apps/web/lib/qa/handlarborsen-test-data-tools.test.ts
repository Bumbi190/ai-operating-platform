import {beforeEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({authority:vi.fn(),client:vi.fn(),save:vi.fn(),dispatch:vi.fn(),receipt:vi.fn()}))
vi.mock('@/lib/atlas/handlarborsen-test-data/authority',()=>({resolveCleanupOperator:m.authority}))
vi.mock('@/lib/atlas/handlarborsen-test-data/client',()=>({callHandlarborsenTestData:m.client}))
vi.mock('@/lib/atlas/handlarborsen-test-data/review-store',()=>({saveCleanupReview:m.save}))
vi.mock('@/lib/atlas/handlarborsen-test-data/service',()=>({dispatchApprovedCleanup:m.dispatch,reconcileCleanup:m.receipt}))
import {handleCleanupTool,CLEANUP_TOOLS} from '@/lib/atlas/handlarborsen-test-data/atlas-tools'
const c='11000000-0000-4000-8000-000000000001'
beforeEach(()=>{vi.clearAllMocks();m.authority.mockResolvedValue({ok:true,principal:{conversationId:c}});m.client.mockResolvedValue({status:'ok',action:'inventory',data:{organisations:[]}})})
it('has exactly four explicit tools and no classification/approval tool',()=>{expect(CLEANUP_TOOLS.map(t=>t.name)).toEqual(['inspect_handlarborsen_test_data','prepare_handlarborsen_test_cleanup','execute_handlarborsen_test_cleanup','get_handlarborsen_test_cleanup_receipt'])})
it('an ordinary voice turn has zero integration calls',async()=>{expect(await handleCleanupTool('get_current_time',{},c)).toEqual({status:'denied'});expect(m.authority).not.toHaveBeenCalled();expect(m.client).not.toHaveBeenCalled()})
it('a model confirm true or voice yes has no authority',async()=>{expect(await handleCleanupTool('execute_handlarborsen_test_cleanup',{packageId:c,confirm:true},c)).toEqual({status:'denied'});expect(await handleCleanupTool('execute_handlarborsen_test_cleanup',{packageId:c,approval:'ja'},c)).toEqual({status:'denied'});expect(m.dispatch).not.toHaveBeenCalled()})
it('no owned conversation means zero integration calls',async()=>{expect(await handleCleanupTool('inspect_handlarborsen_test_data',{},null)).toEqual({status:'denied'});expect(m.client).not.toHaveBeenCalled()})
it('receipt tool can only reconcile, never dispatch',async()=>{await handleCleanupTool('get_handlarborsen_test_cleanup_receipt',{packageId:c},c);expect(m.receipt).toHaveBeenCalledWith(c,{projectId:'8f673c09-1c8f-4d78-876e-4c14bf1c89b3',conversationId:c});expect(m.dispatch).not.toHaveBeenCalled()})
