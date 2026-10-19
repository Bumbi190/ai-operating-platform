import {randomUUID} from 'node:crypto'
import type {ExecutionLeaseGuard} from './execution-lease-guard.js'
import {launchControlledMaterialization,type ControlledHandlers,type ControlledOutcome,type LaunchResult} from '../isolation/windows/controlled-helper.js'
import {parseMaterializationReport,type MaterializationReport,type MaterializationReadResult} from '../isolation/windows/source-contracts.js'
import {parseWindowsWorkspaceRequest,type WorkspaceRequest} from '../isolation/windows/workspace-contracts.js'
import {reserveWindowsSourceAttempt} from '../isolation/windows/source-attempts.js'
import {cleanupWindowsSourceFixture} from '../isolation/windows/source-fixture.js'
export type GuardedMaterialization=
 |{status:'not_started';reason:'lease_not_live'|'binding_mismatch'|'input_invalid'|'unsupported_platform'|'helper_unavailable'}
 |{status:'observed';attemptId:string;report:MaterializationReport}
 |{status:'stopped';attemptId:string;reason:'stop_requested'|'control_lost'|'lease_lost';cleanup:'confirmed'|'retained'|'unknown';containerRemoved:boolean|null;volumeRemoved:boolean|null}
export interface BridgeDeps{
 platform:NodeJS.Platform
 nextAttempt:()=>string
 reserve:(request:WorkspaceRequest,attemptId:string)=>void
 launch:(payload:unknown,handlers:ControlledHandlers)=>LaunchResult
 cleanup:(input:unknown,attemptId:string)=>Promise<MaterializationReadResult>
 schedule:(callback:()=>void,delayMs:number)=>()=>void
}
/** cleanup 30000 ms + 5000 ms transport margin; after that the helper is forcibly terminated. */
export const STOP_GRACE_MS=35000
/** Hard bound from launch (helper's own deadline, ruling 8): then stop, and the grace kill follows. */
export const HELPER_DEADLINE_MS=185000
const KEYS=['workId','repositoryId','pinnedBaseSha','admissionHash','claimId','fence'] as const
/**
 * Internal construction seam. The guard is owned by the caller and never re-armed here; this bridge only consumes it.
 * A result is `observed` only if no stop was sent and the guard is still live when the report arrives.
 * Nothing in any result grants publication, readiness or further authority.
 */
export function createNativeStopBridge(deps:BridgeDeps):(input:unknown,guard:ExecutionLeaseGuard)=>Promise<GuardedMaterialization>{
 return async(input,guard)=>{
  let request:WorkspaceRequest
  try{request=parseWindowsWorkspaceRequest(input)}catch{return{status:'not_started',reason:'input_invalid'}}
  if(deps.platform!=='win32')return{status:'not_started',reason:'unsupported_platform'}
  // A live mandate authorizes only its own job: the native request must be exactly the guard's bound job.
  if(!guard.binding||KEYS.some(k=>guard.binding[k]!==request[k]))return{status:'not_started',reason:'binding_mismatch'}
  if(guard.signal.aborted||await guard.checkpoint()!=='live'||guard.signal.aborted)return{status:'not_started',reason:'lease_not_live'}
  const attemptId=deps.nextAttempt()
  try{deps.reserve(request,attemptId)}catch{return{status:'not_started',reason:'helper_unavailable'}}
  let stopReason:'lease_lost'|'control_lost'|null=null,launched:LaunchResult
  let killNow=()=>{}
  const grace:{armed:boolean;cancel:(()=>void)|null;deadline:(()=>void)|null}={armed:false,cancel:null,deadline:null}
  // Any stop, from any source, starts exactly one grace period that ends in a forced kill.
  const armGrace=()=>{if(grace.armed)return;grace.armed=true;grace.cancel=deps.schedule(()=>{grace.cancel=null;killNow()},STOP_GRACE_MS)}
  const sendStop=(reason:'lease_lost'|'control_lost')=>{
   if(stopReason===null){stopReason=reason;proc?.stop()}
   armGrace()
  }
  const requestStop=()=>sendStop('lease_lost')
  let proc:{continue(n:number):void;stop():void;kill():void;done:Promise<ControlledOutcome>}|null=null
  const handlers:ControlledHandlers={stopped:armGrace,checkpoint(seq){
   void(async()=>{
    if(stopReason!==null)return
    const state=await guard.checkpoint()
    if(state==='live'&&stopReason===null&&!guard.signal.aborted)proc?.continue(seq);else requestStop()
   })()
  }}
  const payload={...request,schema:'sdf.windows_materialization_request.v1',attemptId}
  try{launched=deps.launch(payload,handlers)}catch{return{status:'not_started',reason:'helper_unavailable'}}
  if(launched.status!=='launched')return{status:'not_started',reason:'helper_unavailable'}
  proc=launched.process;const own=launched.process;let killed=false;killNow=()=>{if(!killed){killed=true;own.kill()}}
  grace.deadline=deps.schedule(()=>{grace.deadline=null;sendStop('control_lost')},HELPER_DEADLINE_MS)
  const onAbort=()=>requestStop()
  if(guard.signal.aborted)requestStop();else guard.signal.addEventListener('abort',onAbort,{once:true})
  let outcome:ControlledOutcome
  try{outcome=await own.done}finally{guard.signal.removeEventListener('abort',onAbort)}
  grace.cancel?.();grace.cancel=null;grace.deadline?.();grace.deadline=null
  let report:MaterializationReport|null=null
  if(outcome.kind==='report'){
   try{
    const parsed=parseMaterializationReport(outcome.value)
    if(parsed.attemptId!==attemptId||KEYS.some(k=>parsed.binding[k]!==request[k])||parsed.status==='cleaned')throw Error('foreign report')
    report=parsed
   }catch{report=null}
  }
  const stopped=(reason:'stop_requested'|'control_lost'|'lease_lost',cleanup:'confirmed'|'retained'|'unknown',c:boolean|null,v:boolean|null):GuardedMaterialization=>({status:'stopped',attemptId,reason,cleanup,containerRemoved:c,volumeRemoved:v})
  const cleanOnce=async(reason:'stop_requested'|'control_lost'|'lease_lost'):Promise<GuardedMaterialization>=>{
   let result:MaterializationReadResult
   try{result=await deps.cleanup(input,attemptId)}catch{return stopped(reason,'unknown',null,null)}
   if(result.status==='observed'&&result.report.status==='cleaned')return stopped(reason,'confirmed',true,true)
   if(result.status==='observed'&&result.report.status==='failed'&&result.report.reason==='cleanup_retained')return stopped(reason,'retained',result.report.containerRemoved,result.report.volumeRemoved)
   return stopped(reason,'unknown',null,null)
  }
  if(report===null){killNow();return cleanOnce(stopReason??'control_lost')}
  // No stop sent: require the guard to still be live at the moment the report is accepted.
  if(stopReason===null&&report.status!=='stopped'){
   const state=guard.signal.aborted?'stopped':await guard.checkpoint()
   if(state==='live'&&!guard.signal.aborted)return{status:'observed',attemptId,report}
   stopReason='lease_lost'
  }
  const reason=stopReason??(report.reason==='stop_requested'?'stop_requested':'control_lost')
  if(report.status==='stopped')return stopped(reason,'confirmed',true,true)
  if(report.containerRemoved&&report.volumeRemoved&&report.status==='verified_for_fixture')return stopped(reason,'confirmed',true,true)
  if(report.status==='failed'&&report.reason==='cleanup_retained')return stopped(reason,'retained',report.containerRemoved,report.volumeRemoved)
  // Any other report after a stop is ambiguous about absence: confirm it with exactly one identity-checked cleanup.
  return cleanOnce(reason)
 }
}
export const runGuardedMaterialization=createNativeStopBridge({
 platform:process.platform,nextAttempt:randomUUID,reserve:reserveWindowsSourceAttempt,launch:launchControlledMaterialization,cleanup:cleanupWindowsSourceFixture,
 schedule:(callback,delayMs)=>{const timer=setTimeout(callback,delayMs);return()=>clearTimeout(timer)},
})
