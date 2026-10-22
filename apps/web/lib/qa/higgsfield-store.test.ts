import {describe,it,expect,vi} from 'vitest'
vi.mock('../supabase/admin',()=>({createAdminClient:()=>{throw Error('not injected')}}))
import {createHiggsfieldStore} from '../media/higgsfield/store'
const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
describe('provider store refusal semantics',()=>{
 it('does not convert database failures to disconnected',async()=>{
  const store=createHiggsfieldStore({rpc:async()=>({error:{message:'secret'}})} as never)
  await expect(store.readConnection(projectId)).rejects.toThrow('storage_unavailable')
 })
 it('distinguishes stale CAS from successful save',async()=>{
  const store=createHiggsfieldStore({rpc:async()=>({data:false,error:null})} as never)
  await expect(store.saveConnectionCAS({projectId,version:2,payload:{},subject:null,identityVerified:false})).rejects.toThrow('connection_changed')
 })
 it('treats consumed and expired state as invalid, never retries it',async()=>{
  let calls=0
  const store=createHiggsfieldStore({rpc:async()=>{calls++;return {data:[],error:null}}} as never)
  await expect(store.consumeOAuthAttempt('a'.repeat(64),'operator')).rejects.toThrow('state_invalid')
  expect(calls).toBe(1)
 })
 it('does not expose pending state when actor does not match',async()=>{
  const store=createHiggsfieldStore({rpc:async()=>({data:null,error:null})} as never)
  expect(await store.peekOAuthAttempt('a'.repeat(64),'operator')).toBe(null)
 })
 it('validates project identities before touching privileged persistence',async()=>{
  const rpc=vi.fn()
  const store=createHiggsfieldStore({rpc} as never)
  await expect(store.readConnection('not-a-uuid')).rejects.toThrow()
  expect(rpc).not.toHaveBeenCalled()
 })
})
