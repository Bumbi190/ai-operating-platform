import {beforeEach,afterEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({operator:vi.fn(),access:vi.fn(),rpc:vi.fn(),fetch:vi.fn()}))
vi.mock('@/lib/auth/platform-operator',()=>({resolvePlatformOperator:m.operator}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:m.access,assertProjectAllowed:(id:string,ids:string[])=>ids.includes(id)}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc})}))
import {resolveCleanupOperator,isVerifiedCleanupOperator} from '@/lib/atlas/handlarborsen-test-data/authority'
const userId='c1000000-0000-4000-8000-000000000001',projectId='8f673c09-1c8f-4d78-876e-4c14bf1c89b3',conversationId='d1000000-0000-4000-8000-000000000001',operatorBindingId='b1000000-0000-4000-8000-000000000001'
const grant={userId,projectId,conversationId,operatorBindingId,allowedOperations:['quarantine','restore'],atlasMode:'observer'}
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',m.fetch);m.operator.mockResolvedValue({ok:true,userId,email:'operator@example.test',actor:'user:'+userId});m.access.mockResolvedValue({ok:true,userId,allowedProjectIds:[projectId]});m.rpc.mockResolvedValue({data:grant,error:null})})
afterEach(()=>vi.unstubAllGlobals())
it('wrong_project_denied without upstream work',async()=>{expect((await resolveCleanupOperator({projectId:'01000000-0000-4000-8000-000000000001',conversationId})).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled();expect(m.fetch).toHaveBeenCalledTimes(0)})
it('viewer_denied even with a platform-operator identity',async()=>{m.access.mockResolvedValue({ok:true,userId,allowedProjectIds:[]});expect((await resolveCleanupOperator({projectId,conversationId})).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled();expect(m.fetch).toHaveBeenCalledTimes(0)})
it('ordinary project owner is not automatically an operator',async()=>{m.operator.mockResolvedValue({ok:false,reason:'not_platform_operator'});expect((await resolveCleanupOperator({projectId,conversationId})).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled()})
it('signout denies a fresh request before grant lookup',async()=>{m.operator.mockResolvedValue({ok:false,reason:'unauthenticated'});expect((await resolveCleanupOperator({projectId,conversationId})).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled()})
it('denies identity drift between the two verified session predicates',async()=>{m.access.mockResolvedValue({ok:true,userId:'01000000-0000-4000-8000-000000000002',allowedProjectIds:[projectId]});expect((await resolveCleanupOperator({projectId,conversationId})).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled()})
it('observer_without_operation_grant_denied',async()=>{m.rpc.mockResolvedValue({data:{...grant,allowedOperations:[]},error:null});expect((await resolveCleanupOperator({projectId,conversationId,operation:'quarantine'})).ok).toBe(false);expect(m.fetch).toHaveBeenCalledTimes(0)})
it('observer with an explicit matching grant may prepare that operation',async()=>{
 const result=await resolveCleanupOperator({projectId,conversationId,operation:'quarantine'});expect(result.ok).toBe(true);if(!result.ok)return;
 expect(isVerifiedCleanupOperator(result.principal)).toBe(true);expect(Object.isFrozen(result.principal)).toBe(true);
 expect(m.rpc).toHaveBeenCalledWith('handlarborsen_resolve_test_data_operator',{p_user_id:userId,p_project_id:projectId,p_conversation_id:conversationId,p_operation:'quarantine'});
 expect(isVerifiedCleanupOperator(JSON.parse(JSON.stringify(result.principal)))).toBe(false);
})
it('a read grant does not invent mutation operations',async()=>{m.rpc.mockResolvedValue({data:{...grant,allowedOperations:[]},error:null});const result=await resolveCleanupOperator({projectId,conversationId});expect(result.ok).toBe(true);if(result.ok)expect(result.principal.allowedOperations).toEqual([])})
it('revoked_principal_denied and wrong conversation return no authority',async()=>{m.rpc.mockResolvedValue({data:null,error:null});expect((await resolveCleanupOperator({projectId,conversationId})).ok).toBe(false);expect(m.fetch).toHaveBeenCalledTimes(0)})
it('rejects grant rows with a different owner or conversation',async()=>{m.rpc.mockResolvedValue({data:{...grant,conversationId:'d1000000-0000-4000-8000-000000000002'},error:null});expect((await resolveCleanupOperator({projectId,conversationId})).ok).toBe(false)})
it('does not leak database details or accept unavailable grant state',async()=>{m.rpc.mockRejectedValue(new Error('private credential detail'));const result=await resolveCleanupOperator({projectId,conversationId});expect(result.ok).toBe(false);expect(JSON.stringify(result)).not.toContain('private credential')})
it('does not treat model-supplied principal-shaped objects as verified',()=>{expect(isVerifiedCleanupOperator({...grant,confirm:true})).toBe(false);expect(m.fetch).toHaveBeenCalledTimes(0)})
