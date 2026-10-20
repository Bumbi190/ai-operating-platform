import type {ClaimHandle} from '../protocol/response-order.js'
import type {OperationResult} from '../protocol/operational-client.js'
import type {ExecutionLeaseRead} from '../protocol/execution-lease-client.js'
import {parseExecutionLease,type ExecutionLeaseV1} from '../protocol/execution-lease-contracts.js'
import {abortable} from '../protocol/bounded-json.js'
export interface ExecutionLeaseGuardDeps {
 monotonicNow:()=>number;wallNow:()=>number
 read:(counter:number,signal:AbortSignal)=>Promise<OperationResult<ExecutionLeaseRead>>
 nextCounter:()=>number
 schedule:(callback:()=>void,delayMs:number)=>()=>void
}
/**
 * binding is a frozen snapshot of the job this guard was created for; consumers must refuse any other job.
 * claimSingleUse returns true exactly once in the guard's lifetime (never after stop): one guard authorizes one native attempt.
 */
export type GuardUse='native_materialization'
export interface ExecutionLeaseGuard{readonly signal:AbortSignal;readonly binding:Readonly<ExecutionLeaseV1['binding']>;checkpoint():Promise<'live'|'stopped'>;stop():void;claimSingleUse(purpose:GuardUse):boolean}
/** Claims of guards this module created. A copied or hand-built object is not in here and can never be claimed. */
const claims=new WeakMap<object,(purpose:GuardUse)=>boolean>()
/** The only claim path consumers may use: refuses any object this factory did not create, and any second claim. */
export function claimGuardUse(guard:unknown,purpose:GuardUse):boolean{const claim=typeof guard==='object'&&guard!==null?claims.get(guard):undefined;return claim?claim(purpose):false}
interface GuardInput{claim:ClaimHandle;expected:{projectId:string;binding:ExecutionLeaseV1['binding'];authorityPins:ExecutionLeaseV1['authorityPins']}}
export function createExecutionLeaseGuard(input:GuardInput,deps:ExecutionLeaseGuardDeps):ExecutionLeaseGuard{
 const controller=new AbortController(),expected=structuredClone(input.expected),initialCounter=input.claim.requestCounter
 const anchorMono=deps.monotonicNow(),anchorWall=deps.wallNow()
 let lastMono=anchorMono,stopped=false,until:number|null=null,counter=initialCounter,version:number|null=null,state:ExecutionLeaseV1['state']|null=null
 let used=false
 let inflight:Promise<'live'|'stopped'>|null=null,cancelExpiry:(()=>void)|null=null,cancelRefresh:(()=>void)|null=null
 function stop(){if(stopped)return;stopped=true;controller.abort();cancelExpiry?.();cancelRefresh?.();cancelExpiry=cancelRefresh=null}
 function current():number|null{
  if(stopped)return null
  const mono=deps.monotonicNow(),wall=deps.wallNow()
  if(!Number.isFinite(mono)||!Number.isFinite(wall)||mono<lastMono||Math.abs((wall-anchorWall)-(mono-anchorMono))>1000||(until!==null&&mono>=until)){stop();return null}
  lastMono=mono;return mono
 }
 const same=<T extends object>(a:T,b:T)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k as keyof T]===b[k as keyof T])
 function arm(){
  cancelExpiry?.();cancelRefresh?.()
  const now=current();if(now===null||until===null)return
  cancelExpiry=deps.schedule(()=>{cancelExpiry=null;const now=current();if(now!==null&&until!==null)cancelExpiry=deps.schedule(stop,Math.max(1,until-now))},Math.max(1,until-now))
  cancelRefresh=deps.schedule(()=>{cancelRefresh=null;void checkpoint()},5000)
 }
 async function observe():Promise<'live'|'stopped'>{
  const start=current();if(start===null)return'stopped'
  try{
   const next=deps.nextCounter();if(!Number.isSafeInteger(next)||next<=counter)throw Error('counter')
   const result=await abortable(deps.read(next,controller.signal),controller.signal),now=current()
   if(now===null)return'stopped'
   if(!result||result.requestCounter!==next||!Number.isSafeInteger(result.httpStatus)||result.httpStatus<200||result.httpStatus>=300||result.body?.status!=='live')throw Error('refused')
   const lease=parseExecutionLease(result.body.lease)
   if(lease.projectId!==expected.projectId||!same(lease.binding,expected.binding)||!same(lease.authorityPins,expected.authorityPins))throw Error('binding')
   if(version!==null&&(lease.stateVersion<version||(lease.stateVersion===version&&lease.state!==state)))throw Error('version')
   if((state==='preparing'&&lease.state==='claimed')||((state==='working'||state==='testing')&&(lease.state==='claimed'||lease.state==='preparing')))throw Error('state')
   const remaining=Math.min(10000,lease.leaseUntilMs-lease.serverNowMs,lease.authorizationExpiresAtMs-lease.serverNowMs,lease.runtimeExpiresAtMs-lease.serverNowMs)-(now-start)-1000
   if(!Number.isFinite(remaining)||remaining<=0)throw Error('expired')
   counter=next;version=lease.stateVersion;state=lease.state;until=now+remaining;arm();return stopped?'stopped':'live'
  }catch{stop();return'stopped'}
 }
 function checkpoint():Promise<'live'|'stopped'>{
  if(current()===null)return Promise.resolve('stopped')
  if(inflight)return inflight
  inflight=Promise.resolve().then(observe).finally(()=>{inflight=null});return inflight
 }
 if(!Number.isFinite(anchorMono)||!Number.isFinite(anchorWall)||!Number.isSafeInteger(initialCounter)||initialCounter<1
 ||input.claim.workId!==expected.binding.workId||input.claim.claimId!==expected.binding.claimId||input.claim.fence!==expected.binding.fence)stop()
 function claimSingleUse(purpose:GuardUse):boolean{if(used||stopped||purpose!=='native_materialization'){used=true;return false}used=true;return true}
 const guard:ExecutionLeaseGuard=Object.freeze({signal:controller.signal,binding:Object.freeze({...expected.binding}),checkpoint,stop,claimSingleUse})
 claims.set(guard,claimSingleUse)
 return guard
}
