import {describe,it,expect,vi} from 'vitest'
import {leaseFixture,claimFixture,signedLeaseHarness,TOKEN} from './fixtures/sdf-execution-lease-fixtures'
import {brokerClaimTokenHash} from '@/lib/atlas/code-work/claim-credential/claim-credential'
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{throw Error('no real database in projection tests')}}))
async function project(v:unknown){const m=await import('@/lib/atlas/code-broker/execution-lease/projection').catch(()=>({})) as any;expect(m.projectExecutionLease).toBeTypeOf('function');return m.projectExecutionLease(v)}
async function service(){const m=await import('@/lib/atlas/code-broker/execution-lease/service').catch(()=>({})) as any;expect(m.executionLeaseForBroker).toBeTypeOf('function');return m.executionLeaseForBroker}
describe('closed live lease projection',()=>{
 it('returns the bounded database projection',async()=>expect(await project(leaseFixture())).toEqual(leaseFixture()))
 for(const change of [
  (v:any)=>v.extra=true,(v:any)=>delete v.projectId,(v:any)=>v.productionAuthority=true,(v:any)=>v.schema='other',
  (v:any)=>v.binding.root='C:/private',(v:any)=>v.binding.workId='bad',(v:any)=>v.binding.claimId=v.binding.claimId.toUpperCase()+'A',
  (v:any)=>v.binding.repositoryId='github.com/foreign/repo',(v:any)=>v.binding.pinnedBaseSha='x'.repeat(40),(v:any)=>v.binding.admissionHash='bad',
  (v:any)=>v.binding.fence=0,(v:any)=>v.binding.fence=1.5,(v:any)=>v.authorityPins.extra=true,(v:any)=>v.authorityPins.missionVersion=0,
  (v:any)=>v.authorityPins.workPackageHash='bad',(v:any)=>v.authorityPins.missionId='not-a-uuid',
  (v:any)=>v.state='cancelled',(v:any)=>v.stateVersion=0,(v:any)=>v.serverNowMs=Infinity,(v:any)=>v.runtimeExpiresAtMs=NaN,
  (v:any)=>v.leaseUntilMs=v.serverNowMs,(v:any)=>v.leaseUntilMs=v.serverNowMs+90001,(v:any)=>v.authorizationExpiresAtMs=v.leaseUntilMs-1,
  (v:any)=>v.runtimeExpiresAtMs=v.leaseUntilMs-1,(v:any)=>v.serverNowMs=1.25,(v:any)=>v.projectId=null
 ])it('refuses malformed or enlarged lease '+change.toString(),async()=>{const v=leaseFixture();change(v);expect(await project(v)).toBeNull()})
 it('accepts a shortened lease with matching expiry bounds',async()=>{const v=leaseFixture();v.leaseUntilMs=v.authorizationExpiresAtMs=v.runtimeExpiresAtMs=v.serverNowMs+1;expect(await project(v)).not.toBeNull()})
 it('does not publish raw rows or secrets returned by a store',async()=>{const run={...leaseFixture(),brokerTokenHash:'a'.repeat(64),admission:{secret:TOKEN}};expect(await project(run)).toBeNull()})
})
describe('authenticated-principal lease service',()=>{
 it('hashes the token and derives broker host from principal',async()=>{const fn=await service(),h=signedLeaseHarness(),body=claimFixture(),calls:any[]=[];const r=await fn(h.broker,body,{store:{read:async(input:any)=>{calls.push(input);return leaseFixture()}}});expect(r).toEqual({status:'live',lease:leaseFixture()});expect(calls).toEqual([{...body,claimToken:undefined,brokerId:h.broker.brokerId,brokerHostId:h.broker.hostId,brokerTokenHash:brokerClaimTokenHash(body.workId,TOKEN)}].map(({claimToken,...v})=>v));expect(JSON.stringify(r)).not.toContain(TOKEN)})
 for(const change of [(v:any)=>v.binding.workId='50000000-0000-4000-8000-000000000002',(v:any)=>v.binding.claimId='60000000-0000-4000-8000-000000000002',(v:any)=>v.binding.fence=2,(v:any)=>v.binding.repositoryId='github.com/foreign/repo',(v:any)=>v.cancelRequested=true])it('withholds a mismatched or unsafe RPC reply '+change.toString(),async()=>{const fn=await service(),h=signedLeaseHarness(),v=leaseFixture();change(v);expect(await fn(h.broker,claimFixture(),{store:{read:async()=>v}})).toEqual({status:'not_live'})})
 it('returns one refusal for a settled run, missing parent or SQL error',async()=>{const fn=await service(),h=signedLeaseHarness();for(const value of [null,{state:'cancelled'},new Error('secret SQL detail '+TOKEN)])expect(await fn(h.broker,claimFixture(),{store:{read:async()=>{if(value instanceof Error)throw value;return value}}})).toEqual({status:'not_live'})})
 it('never asks SQL to verify a malformed claim credential',async()=>{const fn=await service(),h=signedLeaseHarness();let calls=0;expect(await fn(h.broker,{...claimFixture(),claimToken:'bad'},{store:{read:async()=>{calls++;return leaseFixture()}}})).toEqual({status:'not_live'});expect(calls).toBe(0)})
})
