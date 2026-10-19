import {spawn} from 'node:child_process'
import {RUNTIME,HELPER,HELPER_ENV,checkBootstrap,decodeWorkspaceHelperJson} from './workspace-helper.js'
/** Closed sdf.native_control.v1 phases, in the only order the helper may announce them. */
export const CONTROL_PHASES=Object.freeze(['before_resources','before_volume_create','before_container_create','before_upload','before_start','before_report'] as const)
export type ControlPhase=typeof CONTROL_PHASES[number]
export type ControlViolation='frame_invalid'|'stderr_output'|'output_too_large'|'exited_without_report'|'spawn_failed'
export type ControlledOutcome={kind:'report';value:unknown}|{kind:'violation';reason:ControlViolation}
/** stopped() fires exactly once, when a stop is first sent for any reason (caller request or detected violation). */
export interface ControlledHandlers{checkpoint(seq:number,phase:ControlPhase):void;stopped?():void}
export interface ControlledProcess{readonly pid:number|null;continue(seq:number):void;stop():void;kill():void;readonly done:Promise<ControlledOutcome>}
export type LaunchResult={status:'launched';process:ControlledProcess}|{status:'unavailable';reason:'unsupported_platform'|'input_invalid'|'helper_unavailable'}
interface ChildLike{pid?:number;stdin:NodeJS.WritableStream|null;stdout:NodeJS.ReadableStream|null;stderr:NodeJS.ReadableStream|null;kill():boolean;on(event:string,listener:(...a:any[])=>void):unknown}
export interface ControlledDeps{platform:NodeJS.Platform;checkBootstrap:()=>void;spawn:(file:string,args:string[],options:Record<string,unknown>)=>ChildLike}
const MAX_REQUEST=4096,MAX_CHECKPOINT=256,MAX_REPORT=262144+64,MAX_TOTAL=MAX_REPORT+MAX_CHECKPOINT*CONTROL_PHASES.length
const decoder=()=>new TextDecoder('utf-8',{fatal:true})
/**
 * Internal construction seam. The child is spawned detached from Node's kill-on-close job so that broker death
 * reaches the helper as stdin EOF (cooperative stop and cleanup) instead of an abrupt termination.
 */
export function createControlledLauncher(deps:ControlledDeps):(payload:unknown,handlers:ControlledHandlers)=>LaunchResult{
 return(payload,handlers)=>{
  if(deps.platform!=='win32')return{status:'unavailable',reason:'unsupported_platform'}
  let request:string
  try{request=JSON.stringify(payload);if(typeof request!=='string'||request.includes('\n')||Buffer.byteLength(request,'utf8')>MAX_REQUEST)throw Error()}catch{return{status:'unavailable',reason:'input_invalid'}}
  try{deps.checkBootstrap()}catch{return{status:'unavailable',reason:'helper_unavailable'}}
  let child:ChildLike
  try{child=deps.spawn(RUNTIME,[HELPER,'materialize-fixture'],{shell:false,windowsHide:true,detached:true,stdio:['pipe','pipe','pipe'],env:{...HELPER_ENV}})}catch{return{status:'unavailable',reason:'helper_unavailable'}}
  let violation:ControlViolation|null=null,reportValue:unknown=undefined,reported=false,seq=0,phase=-1,total=0,stopped=false,stdinOpen=true,exited=false,killed=false
  let pending=Buffer.alloc(0)
  let resolve!:(o:ControlledOutcome)=>void;const done=new Promise<ControlledOutcome>(r=>{resolve=r})
  const write=(line:string)=>{if(!stdinOpen||!child.stdin)return;try{child.stdin.write(line+'\n')}catch{stdinOpen=false}}
  const stop=()=>{if(stopped)return;stopped=true;write('{"t":"stop"}');if(stdinOpen&&child.stdin){stdinOpen=false;try{child.stdin.end()}catch{}};try{handlers.stopped?.()}catch{}}
  const fail=(reason:ControlViolation)=>{if(violation===null)violation=reason;stop()}
  const frame=(bytes:Buffer)=>{
   if(violation!==null)return
   if(reported){fail('frame_invalid');return}
   let value:any
   try{value=decodeWorkspaceHelperJson(decoder().decode(bytes),MAX_REPORT)}catch{fail('frame_invalid');return}
   if(!value||typeof value!=='object'||Array.isArray(value)){fail('frame_invalid');return}
   const keys=Object.keys(value).sort().join(',')
   if(value.t==='checkpoint'&&keys==='phase,seq,t'&&bytes.length<=MAX_CHECKPOINT){
    const index=CONTROL_PHASES.indexOf(value.phase)
    if(!Number.isSafeInteger(value.seq)||value.seq!==seq+1||index<=phase){fail('frame_invalid');return}
    seq=value.seq;phase=index;handlers.checkpoint(seq,value.phase);return
   }
   if(value.t==='report'&&keys==='report,t'){reported=true;reportValue=value.report;return}
   fail('frame_invalid')
  }
  child.stdin?.on('error',()=>{stdinOpen=false})
  child.stdout?.on('data',(chunk:Buffer)=>{
   if(violation!==null)return
   total+=chunk.length;if(total>MAX_TOTAL){fail('output_too_large');return}
   pending=Buffer.concat([pending,chunk])
   for(let at=pending.indexOf(0x0a);at>=0&&violation===null;at=pending.indexOf(0x0a)){const line=pending.subarray(0,at);pending=pending.subarray(at+1);frame(line)}
   if(pending.length>MAX_REPORT)fail('output_too_large')
  })
  child.stderr?.on('data',(chunk:Buffer)=>{if(chunk.length>0)fail('stderr_output')})
  child.on('error',()=>{fail('spawn_failed');if(!exited){exited=true;resolve({kind:'violation',reason:violation!})}})
  child.on('close',(code:number|null)=>{
   if(exited)return;exited=true
   if(violation===null&&pending.length>0)violation='frame_invalid'
   if(violation===null&&(!reported||code!==0))violation='exited_without_report'
   resolve(violation===null?{kind:'report',value:reportValue}:{kind:'violation',reason:violation})
  })
  write(request)
  const process:ControlledProcess={
   get pid(){return typeof child.pid==='number'?child.pid:null},
   continue(n:number){if(!stopped&&violation===null&&n===seq)write('{"t":"continue","seq":'+n+'}')},
   stop,
   kill(){if(killed||exited)return;killed=true;try{child.kill()}catch{}},
   done,
  }
  return{status:'launched',process}
 }
}
export const launchControlledMaterialization=createControlledLauncher({platform:process.platform,checkBootstrap,spawn:(file,args,options)=>spawn(file,args,options as any)})
