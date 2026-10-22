import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,it,expect,vi} from 'vitest'
vi.mock('../supabase/admin',()=>({createAdminClient:()=>{throw Error('not injected')}}))
import {createHiggsfieldStore} from '../media/higgsfield/store'
const projectId='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
describe('Higgsfield SQL defaults are narrowed rather than inherited',()=>{
 it('removes Supabase service_role ALL before the explicit select/insert/update grant',()=>{
  const migration=readFileSync(resolve(process.cwd(),'supabase/migrations/20261022075921_higgsfield_mcp_readonly.sql'),'utf8')
  const revoke='revoke all on public.media_provider_connections,public.media_provider_oauth_states from public,anon,authenticated,service_role;'
  const grant='grant select,insert,update on public.media_provider_connections,public.media_provider_oauth_states to service_role;'
  expect(migration.indexOf(revoke)).toBeGreaterThan(0)
  expect(migration.indexOf(grant)).toBeGreaterThan(migration.indexOf(revoke))
  expect(migration.slice(migration.indexOf(grant)+grant.length)).not.toMatch(/grant\\s+(?:all|delete|truncate|references|trigger)\\b[^;]*\\bmedia_provider_(?:connections|oauth_states)\\b/i)
 })
})
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
