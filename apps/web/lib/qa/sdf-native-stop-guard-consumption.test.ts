import {describe,it,expect} from 'vitest'
import {leaseFixture,claimFixture} from './fixtures/sdf-execution-lease-fixtures'
import {makeMaterializationReport,makeMaterializationCleanup,makeSourceManifest} from './fixtures/sdf-windows-source-fixtures'
/**
 * RED specification (docs/superpowers/plans/2026-10-20-guard-single-use.md): one ExecutionLeaseGuard authorizes at most one
 * native materialization attempt, ever. The first bridge call consumes it; every later or concurrent call, from any bridge
 * instance, is refused before reservation or launch, and any non-observed outcome also stops the guard.
 * Not part of the approved final gate until the implementation is approved.
 */
const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();await new Promise(r=>setImmediate(r))}
const PHASES=['before_resources','before_volume_create','before_container_create','before_upload','before_start','before_report']
const ATTEMPT='33333333-3333-4333-8333-333333333333'
const bridgeRequest=()=>({schema:'sdf.windows_workspace_request.v1',...makeSourceManifest().binding})
const boundLease=()=>{const l=leaseFixture();l.binding={...makeSourceManifest().binding};return l}
async function bridgeModule(){return await import('../../../code-broker/src/runtime/native-stop-bridge') as any}
async function realGuard(){
 const make=(await import('../../../code-broker/src/runtime/execution-lease-guard')).createExecutionLeaseGuard as any
 let mono=0,wall=1800000000000,counter=1,calls=0;const lease=boundLease()
 const guard=make({claim:{...claimFixture(),workId:lease.binding.workId,claimId:lease.binding.claimId,fence:lease.binding.fence,requestCounter:1,leaseUntil:new Date(lease.leaseUntilMs).toISOString()},expected:{projectId:lease.projectId,binding:structuredClone(lease.binding),authorityPins:structuredClone(lease.authorityPins)}},
  {monotonicNow:()=>mono,wallNow:()=>wall,nextCounter:()=>++counter,schedule:()=>()=>{},read:async(c:number)=>{calls++;return{requestCounter:c,httpStatus:200,body:{status:'live',lease:boundLease()}}}})
 return{guard,get calls(){return calls}}
}
function fakeBridge(m:any){
 const s={launched:0,reserved:0,cleanups:0,handlers:null as any,resolve:null as any}
 const bridge=m.createNativeStopBridge({platform:'win32',nextAttempt:()=>ATTEMPT,reserve:()=>{s.reserved++},
  launch:(_p:any,handlers:any)=>{s.launched++;s.handlers=handlers;const done=new Promise(r=>{s.resolve=r});return{status:'launched',process:{pid:7,continue:()=>{},stop:()=>{},kill:()=>{},done}}},
  cleanup:async()=>{s.cleanups++;return{status:'observed',report:makeMaterializationCleanup()}},
  schedule:()=>()=>{}})
 return{bridge,s,async checkpoint(seq:number){s.handlers.checkpoint(seq,PHASES[seq-1]);await flush()}}
}
const verified=()=>{const r:any=makeMaterializationReport();r.attemptId=ATTEMPT;return r}
const consumed={status:'not_started',reason:'guard_consumed'}
/** A refused reuse returns at once; 'still_running' means a second attempt was actually started. */
const settle=(p:Promise<unknown>)=>Promise.race([p,flush().then(()=>'still_running')])

describe('a lease guard authorizes exactly one native materialization',()=>{
 it('refuses a second attempt after a control_lost stop while the guard is still live, before any reservation or launch',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1)
  f.s.resolve({kind:'violation',reason:'frame_invalid'});expect(await run).toMatchObject({status:'stopped',reason:'control_lost'})
  const before={reserved:f.s.reserved,launched:f.s.launched,calls:g.calls}
  expect(await settle(f.bridge(bridgeRequest(),g.guard))).toEqual(consumed)
  expect({reserved:f.s.reserved,launched:f.s.launched,calls:g.calls}).toEqual(before)
 })
 it('stops the guard after every stopped result, so no other consumer can treat it as live',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1)
  f.s.resolve({kind:'violation',reason:'stderr_output'});await run
  expect(g.guard.signal.aborted).toBe(true);expect(await g.guard.checkpoint()).toBe('stopped')
 })
 it('refuses a second attempt after an observed result',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush()
  for(let n=1;n<=6;n++)await f.checkpoint(n);f.s.resolve({kind:'report',value:verified()});expect((await run).status).toBe('observed')
  expect(await settle(f.bridge(bridgeRequest(),g.guard))).toEqual(consumed);expect(f.s.reserved).toBe(1);expect(f.s.launched).toBe(1)
 })
 it('refuses a concurrent second call while the first attempt is still running',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),first=f.bridge(bridgeRequest(),g.guard);await flush()
  expect(await settle(f.bridge(bridgeRequest(),g.guard))).toEqual(consumed);expect(f.s.reserved).toBe(1);expect(f.s.launched).toBe(1)
  f.s.resolve({kind:'violation',reason:'frame_invalid'});await first
 })
 it('refuses reuse through a different bridge instance',async()=>{
  const m=await bridgeModule(),g=await realGuard(),a=fakeBridge(m),b=fakeBridge(m),run=a.bridge(bridgeRequest(),g.guard);await flush();await a.checkpoint(1)
  a.s.resolve({kind:'violation',reason:'frame_invalid'});await run
  expect(await settle(b.bridge(bridgeRequest(),g.guard))).toEqual(consumed);expect(b.s.reserved+b.s.launched).toBe(0)
 })
 it('consumes the guard on the first call even when that call is refused for another job',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m)
  expect(await f.bridge({...bridgeRequest(),workId:'44444444-4444-4444-8444-444444444444'},g.guard)).toEqual({status:'not_started',reason:'binding_mismatch'})
  expect(await settle(f.bridge(bridgeRequest(),g.guard))).toEqual(consumed);expect(f.s.reserved+f.s.launched).toBe(0)
 })
 it('stops the guard after a refusal, so a mistaken call cannot leave a live mandate behind',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m)
  expect(await f.bridge({...bridgeRequest(),workId:'44444444-4444-4444-8444-444444444444'},g.guard)).toEqual({status:'not_started',reason:'binding_mismatch'})
  expect(g.guard.signal.aborted).toBe(true)
 })
 it('lets exactly one of ten simultaneous calls through ten bridge instances start, with one reservation and one launch in total',async()=>{
  const m=await bridgeModule(),g=await realGuard(),bridges=Array.from({length:10},()=>fakeBridge(m))
  const runs=bridges.map(b=>b.bridge(bridgeRequest(),g.guard));await flush()
  const settled=await Promise.all(runs.map(settle)),refused=settled.filter(r=>JSON.stringify(r)===JSON.stringify(consumed)).length
  expect(refused).toBe(9);expect(bridges.reduce((n,b)=>n+b.s.reserved,0)).toBe(1);expect(bridges.reduce((n,b)=>n+b.s.launched,0)).toBe(1)
  const live=bridges.find(b=>b.s.launched===1)!;live.s.resolve({kind:'violation',reason:'frame_invalid'});await Promise.all(runs)
  expect(g.guard.signal.aborted).toBe(true);expect(bridges.reduce((n,b)=>n+b.s.cleanups,0)).toBe(1)
 })
 it('lets the guard hand out its single-use claim exactly once',async()=>{
  const g=await realGuard();expect(typeof g.guard.claimSingleUse).toBe('function')
  expect(g.guard.claimSingleUse('native_materialization')).toBe(true);expect(g.guard.claimSingleUse('native_materialization')).toBe(false);expect(g.guard.claimSingleUse('other')).toBe(false)
 })
})
