import {EventEmitter} from 'node:events'
import {PassThrough,Writable} from 'node:stream'
import {describe,it,expect} from 'vitest'

const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();await new Promise(r=>setImmediate(r))}
async function launcherModule(){const m=await import('../../../code-broker/src/isolation/windows/controlled-helper').catch(()=>({})) as any;expect(m.createControlledLauncher).toBeTypeOf('function');return m}

/** Fake child with real streams: the test plays the native helper. */
class FakeChild extends EventEmitter{
 stdout=new PassThrough();stderr=new PassThrough();written:string[]=[];ended=0;kills=0;pid=4242
 stdin=new Writable({write:(chunk,_e,cb)=>{this.written.push(chunk.toString('utf8'));cb()},final:cb=>{this.ended++;cb()}})
 kill(){this.kills++;return true}
 line(v:unknown){this.stdout.write(typeof v==='string'?v:JSON.stringify(v)+'\n')}
 close(code:number|null=0){this.stdout.end();this.stderr.end();setImmediate(()=>this.emit('close',code))}
}
const PHASES=['before_resources','before_volume_create','before_container_create','before_upload','before_start','before_report']
const payload={schema:'sdf.windows_materialization_request.v1',workId:'c435e423-d964-428b-b5c0-4060d89ce3c6',attemptId:'11111111-1111-4111-8111-111111111111'}
function harness(m:any,over:any={}){
 const child=new FakeChild(),spawns:any[]=[],seen:[number,string][]=[]
 const launch=m.createControlledLauncher({platform:'win32',checkBootstrap:()=>{},spawn:(...a:any[])=>{spawns.push(a);return child},...over})
 const launched=launch(payload,{checkpoint:(seq:number,phase:string)=>seen.push([seq,phase])})
 return{child,spawns,seen,launched}
}
const checkpoint=(seq:number,phase=PHASES[seq-1])=>({t:'checkpoint',seq,phase})
const report={t:'report',report:{schema:'sdf.windows_materialization_report.v1',status:'stopped'}}

describe('controlled helper framing and spawn',()=>{
 it('refuses before spawning on platform, bootstrap or payload problems',async()=>{
  const m=await launcherModule()
  for(const [over,reason,body] of [[{platform:'linux'},'unsupported_platform',payload],[{checkBootstrap:()=>{throw Error('hash')}},'helper_unavailable',payload],[{},'input_invalid',{pad:'x'.repeat(4100)}],[{},'input_invalid',undefined]] as const){
   const spawns:any[]=[];const launch=m.createControlledLauncher({platform:'win32',checkBootstrap:()=>{},spawn:(...a:any[])=>{spawns.push(a);return new FakeChild()},...(over as any)})
   expect(launch(body,{checkpoint:()=>{}})).toEqual({status:'unavailable',reason});expect(spawns).toHaveLength(0)
  }
 })
 it('spawns the fixed runtime detached without shell, PATH or caller environment and keeps stdin open',async()=>{
  const m=await launcherModule(),h=harness(m)
  expect(h.launched.status).toBe('launched');expect(h.spawns).toHaveLength(1)
  const [file,args,opts]=h.spawns[0]
  expect(file).toBe('C:\\Program Files\\dotnet\\dotnet.exe');expect(args).toHaveLength(2);expect(args[0]).toMatch(/[\\/]\.native[\\/]windows-workspace[\\/]OmniraBrokerWorkspace\.dll$/);expect(args[1]).toBe('materialize-fixture')
  expect(opts).toEqual({shell:false,windowsHide:true,detached:true,stdio:['pipe','pipe','pipe'],env:{NODE_ENV:'production',SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',DOTNET_MULTILEVEL_LOOKUP:'0',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'}})
  await flush();expect(h.child.written).toEqual([JSON.stringify(payload)+'\n']);expect(h.child.ended).toBe(0)
  expect(h.launched.process.pid).toBe(4242);h.child.close(1);await h.launched.process.done
 })
 it('delivers ordered checkpoints, writes exact continue lines and the report only at a clean exit',async()=>{
  const m=await launcherModule(),h=harness(m),p=h.launched.process
  let settled=false;p.done.then(()=>{settled=true})
  for(let s=1;s<=6;s++){h.child.line(checkpoint(s));await flush();p.continue(s)}
  expect(h.seen).toEqual(PHASES.map((x,i)=>[i+1,x]))
  expect(h.child.written.slice(1)).toEqual([1,2,3,4,5,6].map(s=>'{"t":"continue","seq":'+s+'}\n'))
  h.child.line(report);await flush();expect(settled).toBe(false)
  h.child.close(0);expect(await p.done).toEqual({kind:'report',value:report.report});expect(h.child.kills).toBe(0)
 })
 const violations:[string,(c:FakeChild)=>void][]=[
  ['wrong first seq',c=>c.line(checkpoint(2,'before_resources'))],
  ['repeated phase',c=>{c.line(checkpoint(1));c.line(checkpoint(2,'before_resources'))}],
  ['backwards phase',c=>{c.line(checkpoint(1,'before_volume_create'));c.line(checkpoint(2,'before_resources'))}],
  ['unknown phase',c=>c.line(checkpoint(1,'before_publish'))],
  ['extra key',c=>c.line({...checkpoint(1),scope:'all'})],
  ['duplicate key',c=>c.line('{"t":"checkpoint","seq":1,"seq":1,"phase":"before_resources"}\n')],
  ['invalid utf8',c=>c.stdout.write(Buffer.from([0x7b,0x22,0xff,0x22,0x7d,0x0a]))],
  ['oversized checkpoint line',c=>c.line({...checkpoint(1),phase:'before_resources'+' '.repeat(300)})],
  ['not json',c=>c.line('checkpoint 1\n')],
  ['unknown frame type',c=>c.line({t:'publish',seq:1})],
  ['string seq',c=>c.line({t:'checkpoint',seq:'1',phase:'before_resources'})],
  ['frame after report',c=>{c.line(report);c.line(checkpoint(1))}],
  ['second report',c=>{c.line(report);c.line(report)}],
  ['trailing partial line',c=>c.stdout.write('{"t":"report"')],
 ]
 for(const [name,act] of violations)it('fails closed on '+name+' and asks the child to stop',async()=>{
  const m=await launcherModule(),h=harness(m),p=h.launched.process;act(h.child);await flush();h.child.close(0)
  expect(await p.done).toEqual({kind:'violation',reason:'frame_invalid'});expect(h.seen.length).toBeLessThanOrEqual(1)
  // A trailing partial line is only detectable once the child has already exited; there is nothing left to stop.
  const live=name!=='trailing partial line'
  expect(h.child.written.filter(w=>w==='{"t":"stop"}\n')).toHaveLength(live?1:0);expect(h.child.ended).toBe(live?1:0);expect(h.child.written.some(w=>w.includes('continue'))).toBe(false)
 })
 it('treats any stderr byte as a violation',async()=>{const m=await launcherModule(),h=harness(m);h.child.stderr.write('x');h.child.line(report);await flush();h.child.close(0);expect(await h.launched.process.done).toEqual({kind:'violation',reason:'stderr_output'})})
 it('refuses unbounded output',async()=>{const m=await launcherModule(),h=harness(m);h.child.stdout.write('x'.repeat(270000));await flush();h.child.close(0);expect(await h.launched.process.done).toEqual({kind:'violation',reason:'output_too_large'})})
 it('reports exit without report and a report with a failing exit code as violations',async()=>{
  const m=await launcherModule()
  const a=harness(m);a.child.line(checkpoint(1));await flush();a.child.close(null);expect(await a.launched.process.done).toEqual({kind:'violation',reason:'exited_without_report'})
  const b=harness(m);b.child.line(report);await flush();b.child.close(1);expect(await b.launched.process.done).toEqual({kind:'violation',reason:'exited_without_report'})
 })
 it('maps a spawn error to spawn_failed',async()=>{const m=await launcherModule(),h=harness(m);h.child.emit('error',Object.assign(Error('ENOENT'),{code:'ENOENT'}));expect(await h.launched.process.done).toEqual({kind:'violation',reason:'spawn_failed'})})
 it('makes stop idempotent, ignores continue after stop and kills only its own live child once',async()=>{
  const m=await launcherModule(),h=harness(m),p=h.launched.process;h.child.line(checkpoint(1));await flush()
  p.stop();p.stop();p.continue(1);await flush()
  expect(h.child.written.slice(1)).toEqual(['{"t":"stop"}\n']);expect(h.child.ended).toBe(1)
  p.kill();p.kill();expect(h.child.kills).toBe(1);h.child.close(null);await p.done;p.kill();expect(h.child.kills).toBe(1)
 })
 it('tells the bridge exactly once that a stop was sent, whatever its source',async()=>{
  const m=await launcherModule()
  for(const trigger of ['violation','explicit'] as const){
   const child=new FakeChild();let stopped=0
   const p=m.createControlledLauncher({platform:'win32',checkBootstrap:()=>{},spawn:()=>child})(payload,{checkpoint:()=>{},stopped:()=>{stopped++}}).process
   if(trigger==='violation')child.stderr.write('x');else p.stop()
   await flush();p.stop();child.stderr.write('y');await flush()
   expect(stopped,trigger).toBe(1);expect(child.written.filter(w=>w==='{"t":"stop"}\n')).toHaveLength(1);child.close(null);await p.done
  }
 })
 it('never writes after the child stdin errors',async()=>{const m=await launcherModule(),h=harness(m),p=h.launched.process;h.child.stdin.destroy(Object.assign(Error('EPIPE'),{code:'EPIPE'}));await flush();expect(()=>{p.continue(1);p.stop()}).not.toThrow();h.child.close(null);expect((await p.done).kind).toBe('violation')})
})

import {leaseFixture,claimFixture} from './fixtures/sdf-execution-lease-fixtures'
import {makeMaterializationReport,makeMaterializationCleanup,makeSourceManifest} from './fixtures/sdf-windows-source-fixtures'
async function bridgeModule(){const m=await import('../../../code-broker/src/runtime/native-stop-bridge').catch(()=>({})) as any;expect(m.createNativeStopBridge).toBeTypeOf('function');return m}
async function guardFactory():Promise<any>{return(await import('../../../code-broker/src/runtime/execution-lease-guard')).createExecutionLeaseGuard}
const ATTEMPT='33333333-3333-4333-8333-333333333333'
const bridgeRequest=()=>({schema:'sdf.windows_workspace_request.v1',...makeSourceManifest().binding})
/** The guard is bound to the same job binding as the native request, as an operational caller must arrange. */
const boundLease=()=>{const l=leaseFixture();l.binding={...makeSourceManifest().binding};return l}
const live=(c:number)=>({requestCounter:c,httpStatus:200,body:{status:'live',lease:boundLease()}})
const refused=(c:number)=>({requestCounter:c,httpStatus:409,body:{status:'unavailable',reason:'lease_not_live'}})
/** Real irreversible guard with fake clock/read; reads decide liveness per call number. */
async function realGuard(decide:(call:number)=>'live'|'refuse'|'hang'='live' as any){
 const make=await guardFactory();let mono=0,wall=1800000000000,counter=1,calls=0,seq=0
 const timers=new Map<number,{at:number;fn:()=>void}>()
 const lease=boundLease()
 const guard=make({claim:{...claimFixture(),workId:lease.binding.workId,claimId:lease.binding.claimId,fence:lease.binding.fence,requestCounter:1,leaseUntil:new Date(lease.leaseUntilMs).toISOString()},expected:{projectId:lease.projectId,binding:structuredClone(lease.binding),authorityPins:structuredClone(lease.authorityPins)}},
  {monotonicNow:()=>mono,wallNow:()=>wall,nextCounter:()=>++counter,schedule:(fn:()=>void,d:number)=>{const id=++seq;timers.set(id,{at:mono+d,fn});return()=>timers.delete(id)},
   read:async(c:number)=>{const n=++calls,d=typeof decide==='function'?decide(n):'live';if(d==='hang')return new Promise(()=>{});return d==='live'?live(c):refused(c)}})
 return{guard,get calls(){return calls},async advance(ms:number){mono+=ms;wall+=ms;for(let n=0;n<20;n++){const due=[...timers.entries()].filter(([,t])=>t.at<=mono).sort((a,b)=>a[1].at-b[1].at);if(!due.length)break;timers.delete(due[0][0]);due[0][1].fn();await flush()}await flush()}}
}
function fakeBridge(m:any,over:any={}){
 const s={launched:0,reserved:[] as any[],continues:[] as number[],stops:0,kills:0,cleanups:[] as any[],payload:null as any,handlers:null as any,resolve:null as any,timers:[] as {ms:number;fn:()=>void;cancelled:boolean}[],cleanupResult:{status:'observed',report:makeMaterializationCleanup()} as any}
 const bridge=m.createNativeStopBridge({platform:'win32',nextAttempt:()=>ATTEMPT,
  reserve:(r:any,a:string)=>{s.reserved.push([r,a]);if(over.reserveFailure)throw Error('private')},
  launch:(payload:any,handlers:any)=>{s.launched++;s.payload=payload;s.handlers=handlers;if(over.launchUnavailable)return{status:'unavailable',reason:'helper_unavailable'};const done=new Promise(r=>{s.resolve=r});return{status:'launched',process:{pid:7,continue:(n:number)=>s.continues.push(n),stop:()=>{s.stops++},kill:()=>{s.kills++},done}}},
  cleanup:async(input:any,attempt:string)=>{s.cleanups.push([input,attempt]);return s.cleanupResult},
  schedule:(fn:()=>void,ms:number)=>{const t={ms,fn,cancelled:false};s.timers.push(t);return()=>{t.cancelled=true}},...over.deps})
 return{bridge,s,async checkpoint(seq:number){await s.handlers.checkpoint(seq,PHASES[seq-1]);await flush()}}
}
const stoppedReport=(reason='stop_requested')=>{const r:any=makeMaterializationReport();r.status='stopped';r.reason=reason;r.fixture=null;r.containerRemoved=true;r.volumeRemoved=true;r.attemptId=ATTEMPT;return r}
const verifiedReport=()=>{const r:any=makeMaterializationReport();r.attemptId=ATTEMPT;return r}

describe('guard-driven native stop bridge',()=>{
 it('makes no reservation or launch unless the guard is live first',async()=>{
  const m=await bridgeModule()
  const refusedGuard=await realGuard(()=>'refuse'),a=fakeBridge(m)
  expect(await a.bridge(bridgeRequest(),refusedGuard.guard)).toEqual({status:'not_started',reason:'lease_not_live'});expect(a.s.reserved).toHaveLength(0);expect(a.s.launched).toBe(0)
  // A guard stopped before first use can never be claimed (single-use plan): refused before any read or reservation.
  const aborted=await realGuard(),b=fakeBridge(m);aborted.guard.stop()
  expect(await b.bridge(bridgeRequest(),aborted.guard)).toEqual({status:'not_started',reason:'guard_consumed'});expect(b.s.reserved).toHaveLength(0);expect(aborted.calls).toBe(0)
 })
 it('refuses a request for another job than the guard is bound to, before any read or reservation',async()=>{
  const m=await bridgeModule()
  // One fresh guard per call: a guard authorizes one attempt (single-use plan).
  for(const key of ['workId','claimId','pinnedBaseSha','admissionHash','fence'] as const){const g=await realGuard(),f=fakeBridge(m),other:any={...bridgeRequest()};other[key]=key==='fence'?2:key==='pinnedBaseSha'?'f'.repeat(40):key==='admissionHash'?'f'.repeat(64):'44444444-4444-4444-8444-444444444444'
   expect(await f.bridge(other,g.guard)).toEqual({status:'not_started',reason:'binding_mismatch'});expect(f.s.reserved).toHaveLength(0);expect(f.s.launched).toBe(0);expect(g.calls).toBe(0)}
 })
 it('refuses invalid input and other platforms before touching the guard',async()=>{
  const m=await bridgeModule(),g=await realGuard(),h=await realGuard()
  const a=fakeBridge(m);expect(await a.bridge({...bridgeRequest(),root:'C:/'},g.guard)).toEqual({status:'not_started',reason:'input_invalid'})
  const b=fakeBridge(m,{deps:{platform:'linux'}});expect(await b.bridge(bridgeRequest(),h.guard)).toEqual({status:'not_started',reason:'unsupported_platform'})
  expect(g.calls+h.calls).toBe(0);expect(a.s.launched+b.s.launched).toBe(0)
 })
 it('reserves durably before one launch and refuses to launch after a failed reservation',async()=>{
  const m=await bridgeModule(),g=await realGuard(),g2=await realGuard(),f=fakeBridge(m,{reserveFailure:true})
  expect(await f.bridge(bridgeRequest(),g.guard)).toEqual({status:'not_started',reason:'helper_unavailable'});expect(f.s.launched).toBe(0)
  const h=fakeBridge(m,{launchUnavailable:true});expect(await h.bridge(bridgeRequest(),g2.guard)).toEqual({status:'not_started',reason:'helper_unavailable'});expect(h.s.reserved).toHaveLength(1)
 })
 it('continues each checkpoint only after a live guard read and returns the observed report',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush()
  expect(f.s.reserved).toEqual([[{...bridgeRequest()},ATTEMPT]].map(([r,a])=>[expect.objectContaining({workId:(r as any).workId}),a]))
  expect(f.s.payload).toEqual({...bridgeRequest(),schema:'sdf.windows_materialization_request.v1',attemptId:ATTEMPT})
  for(let n=1;n<=6;n++){const before=g.calls;await f.checkpoint(n);expect(g.calls).toBe(before+1)}
  expect(f.s.continues).toEqual([1,2,3,4,5,6]);f.s.resolve({kind:'report',value:verifiedReport()})
  const r=await run;expect(r.status).toBe('observed');expect(r.report.status).toBe('verified_for_fixture');expect(f.s.stops).toBe(0);expect(f.s.cleanups).toHaveLength(0);expect(f.s.launched).toBe(1);g.guard.stop()
 })
 for(const at of [1,2,3,4,5,6])it('stops instead of continuing when the guard refuses at checkpoint '+at,async()=>{
  const m=await bridgeModule(),g=await realGuard(n=>n<=at?'live':'refuse'),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush()
  for(let n=1;n<=at;n++)await f.checkpoint(n)
  expect(f.s.continues).toEqual(Array.from({length:at-1},(_,i)=>i+1));expect(f.s.stops).toBeGreaterThanOrEqual(1);expect(g.guard.signal.aborted).toBe(true)
  f.s.resolve({kind:'report',value:stoppedReport()})
  expect(await run).toEqual({status:'stopped',attemptId:ATTEMPT,reason:'lease_lost',cleanup:'confirmed',containerRemoved:true,volumeRemoved:true});expect(f.s.cleanups).toHaveLength(0)
  expect(await g.guard.checkpoint()).toBe('stopped')
 })
 it('sends stop immediately when the guard aborts mid-phase',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1);await f.checkpoint(2)
  expect(f.s.stops).toBe(0);g.guard.stop();await flush();expect(f.s.stops).toBe(1);expect(f.s.timers.filter(t=>!t.cancelled).map(t=>t.ms)).toEqual([185000,35000])
  f.s.resolve({kind:'report',value:stoppedReport()});const r=await run;expect(r).toMatchObject({status:'stopped',reason:'lease_lost',cleanup:'confirmed'});expect(f.s.timers.every(t=>t.cancelled)).toBe(true)
 })
 it('stops when the guard window expires during a long phase without a refresh',async()=>{
  const m=await bridgeModule(),g=await realGuard(n=>n===1||n===2?'live':'hang'),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1)
  await g.advance(5000);await g.advance(4000);expect(g.guard.signal.aborted).toBe(true);expect(f.s.stops).toBe(1)
  f.s.resolve({kind:'report',value:stoppedReport()});expect(await run).toMatchObject({status:'stopped',reason:'lease_lost'})
 })
 it('discards a verified report that arrives after stop and keeps the guard aborted',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();for(let n=1;n<=6;n++)await f.checkpoint(n)
  g.guard.stop();await flush();f.s.resolve({kind:'report',value:verifiedReport()})
  const r=await run;expect(r).toEqual({status:'stopped',attemptId:ATTEMPT,reason:'lease_lost',cleanup:'confirmed',containerRemoved:true,volumeRemoved:true});expect(JSON.stringify(r)).not.toContain('fixture');expect(await g.guard.checkpoint()).toBe('stopped')
 })
 it('treats a report observed after guard expiry as stopped',async()=>{
  const m=await bridgeModule(),g=await realGuard(n=>n<=7?'live':'refuse'),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();for(let n=1;n<=6;n++)await f.checkpoint(n)
  f.s.resolve({kind:'report',value:verifiedReport()});const r=await run;expect(r).toMatchObject({status:'stopped',reason:'lease_lost'});expect(r.report).toBeUndefined()
 })
 it('kills a helper that does not report within 35000ms of stop, then cleans exactly once',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1);g.guard.stop();await flush()
  const grace=f.s.timers.find(t=>!t.cancelled&&t.ms===35000)!;expect(f.s.kills).toBe(0);grace.fn();expect(f.s.kills).toBe(1)
  f.s.resolve({kind:'violation',reason:'exited_without_report'});const r=await run
  expect(r).toEqual({status:'stopped',attemptId:ATTEMPT,reason:'lease_lost',cleanup:'confirmed',containerRemoved:true,volumeRemoved:true});expect(f.s.cleanups).toEqual([[expect.objectContaining({workId:bridgeRequest().workId}),ATTEMPT]]);expect(f.s.launched).toBe(1)
 })
 it('arms the 35000ms kill when the helper stops itself on a violation and hangs, then cleans exactly once',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1)
  expect(f.s.handlers.stopped).toBeTypeOf('function');f.s.handlers.stopped();f.s.handlers.stopped()
  const graces=f.s.timers.filter(t=>!t.cancelled&&t.ms===35000);expect(graces).toHaveLength(1);expect(f.s.kills).toBe(0);graces[0].fn();expect(f.s.kills).toBe(1)
  expect(g.guard.signal.aborted).toBe(false);f.s.resolve({kind:'violation',reason:'stderr_output'});const r=await run
  expect(r).toMatchObject({status:'stopped',attemptId:ATTEMPT,reason:'control_lost',cleanup:'confirmed'});expect(f.s.cleanups).toHaveLength(1);expect(f.s.launched).toBe(1);expect(f.s.timers.filter(t=>t.ms===185000).every(t=>t.cancelled)).toBe(true);g.guard.stop()
 })
 it('bounds a silent helper while the guard stays live: stop at 185000ms, kill 35000ms later, then one cleanup',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1)
  expect(m.HELPER_DEADLINE_MS).toBe(185000);const deadline=f.s.timers.filter(t=>!t.cancelled&&t.ms===185000);expect(deadline).toHaveLength(1);expect(f.s.stops).toBe(0)
  deadline[0].fn();expect(f.s.stops).toBe(1);const grace=f.s.timers.filter(t=>!t.cancelled&&t.ms===35000);expect(grace).toHaveLength(1)
  await f.checkpoint(2);expect(f.s.continues).toEqual([1])
  grace[0].fn();expect(f.s.kills).toBe(1);f.s.resolve({kind:'violation',reason:'exited_without_report'});const r=await run
  expect(r).toMatchObject({status:'stopped',attemptId:ATTEMPT,reason:'control_lost',cleanup:'confirmed'});expect(f.s.cleanups).toHaveLength(1);expect(f.s.launched).toBe(1);g.guard.stop()
 })
 it('accepts no observed report once the deadline stop was sent',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();for(let n=1;n<=6;n++)await f.checkpoint(n)
  f.s.timers.find(t=>!t.cancelled&&t.ms===185000)!.fn();f.s.resolve({kind:'report',value:verifiedReport()})
  const r=await run;expect(r).toMatchObject({status:'stopped',reason:'control_lost'});expect(JSON.stringify(r)).not.toContain('fixture');g.guard.stop()
 })
 it('arms no timer, sends no continue and changes no reason once the outcome is decided',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1)
  f.s.resolve({kind:'report',value:stoppedReport('control_lost')});const r=await run;expect(r).toMatchObject({status:'stopped',reason:'control_lost'})
  const timers=f.s.timers.length,continues=f.s.continues.length,stops=f.s.stops
  f.s.handlers.stopped?.();await f.checkpoint(2)
  expect(f.s.timers.length).toBe(timers);expect(f.s.continues.length).toBe(continues);expect(f.s.stops).toBe(stops);expect(f.s.timers.every(t=>t.cancelled)).toBe(true)
 })
 it('keeps control_lost as the reason when the launcher stopped first and the guard aborts afterwards',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1)
  f.s.handlers.stopped();g.guard.stop();await flush();f.s.resolve({kind:'violation',reason:'stderr_output'})
  expect(await run).toMatchObject({status:'stopped',reason:'control_lost'})
 })
 it('gives up after a bounded wait when a killed helper never closes, and never cleans over a possibly live process',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1);g.guard.stop();await flush()
  f.s.timers.find(t=>!t.cancelled&&t.ms===35000)!.fn();expect(f.s.kills).toBe(1)
  expect(m.KILL_WAIT_MS).toBe(10000);const wait=f.s.timers.find(t=>!t.cancelled&&t.ms===10000);expect(wait).toBeDefined();wait!.fn()
  expect(await run).toEqual({status:'stopped',attemptId:ATTEMPT,reason:'lease_lost',cleanup:'unknown',containerRemoved:null,volumeRemoved:null});expect(f.s.cleanups).toHaveLength(0)
 })
 const failedCleanup=()=>{const r:any=makeMaterializationCleanup();r.status='failed';r.reason='cleanup_retained';r.containerRemoved=false;r.volumeRemoved=false;return r}
 for(const [result,cleanup] of [[{status:'observed',report:makeMaterializationCleanup()},'confirmed'],[{status:'observed',report:failedCleanup()},'retained'],[{status:'unavailable',reason:'deadline_exceeded',attemptId:ATTEMPT},'unknown']] as const)it('maps a protocol violation to one cleanup with outcome '+cleanup,async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m);f.s.cleanupResult=result;const run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1)
  f.s.resolve({kind:'violation',reason:'frame_invalid'});const r=await run
  expect(r).toMatchObject({status:'stopped',attemptId:ATTEMPT,reason:'control_lost',cleanup});expect(f.s.kills).toBe(1);expect(f.s.cleanups).toHaveLength(1);expect(f.s.launched).toBe(1)
  if(cleanup==='unknown')expect(r).toMatchObject({containerRemoved:null,volumeRemoved:null});g.guard.stop()
 })
 it('reports a native control_lost stop while the guard is live as stopped, not observed',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1)
  f.s.resolve({kind:'report',value:stoppedReport('control_lost')});expect(await run).toMatchObject({status:'stopped',reason:'control_lost',cleanup:'confirmed'});expect(f.s.cleanups).toHaveLength(0);g.guard.stop()
 })
 it('confirms absence with one cleanup when a stopped attempt reports an ambiguous failure',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1);g.guard.stop();await flush()
  const failed:any=makeMaterializationReport();failed.status='failed';failed.reason='deadline_exceeded';failed.fixture=null;failed.containerRemoved=false;failed.volumeRemoved=false;failed.attemptId=ATTEMPT
  f.s.resolve({kind:'report',value:failed});expect(await run).toMatchObject({status:'stopped',reason:'lease_lost',cleanup:'confirmed'});expect(f.s.cleanups).toHaveLength(1)
 })
 it('rejects a report for another attempt or binding as a violation',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();for(let n=1;n<=6;n++)await f.checkpoint(n)
  const other=verifiedReport();other.attemptId='44444444-4444-4444-8444-444444444444';f.s.resolve({kind:'report',value:other})
  expect(await run).toMatchObject({status:'stopped',reason:'control_lost'});expect(f.s.cleanups).toHaveLength(1);g.guard.stop()
 })
 it('never carries the claim token or a publication field in any result',async()=>{
  const m=await bridgeModule(),g=await realGuard(),f=fakeBridge(m),run=f.bridge(bridgeRequest(),g.guard);await flush();await f.checkpoint(1);g.guard.stop();await flush();f.s.resolve({kind:'report',value:stoppedReport()})
  const text=JSON.stringify(await run)+JSON.stringify(f.s.payload);expect(text).not.toContain(claimFixture().claimToken);expect(text).not.toMatch(/publish|ready|merge|productionAuthority":true/)
 })
})
