import {execFileSync,spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {performance} from 'node:perf_hooks'
import {describe,it,expect} from 'vitest'
import {createExecutionLeaseGuard} from '../../../code-broker/src/runtime/execution-lease-guard'
import {createNativeStopBridge} from '../../../code-broker/src/runtime/native-stop-bridge'
import {launchControlledMaterialization} from '../../../code-broker/src/isolation/windows/controlled-helper'
import {reserveWindowsSourceAttempt} from '../../../code-broker/src/isolation/windows/source-attempts'
import {cleanupWindowsSourceFixture} from '../../../code-broker/src/isolation/windows/source-fixture'
import {leaseFixture} from './fixtures/sdf-execution-lease-fixtures'
/**
 * Real native evidence for docs/superpowers/plans/2026-10-19-cooperative-native-stop.md.
 * Class N: exactly four approved real attempts (A-D), each dispatched at most once, only with ATLAS_NATIVE_STOP_DISPATCH=<X>
 * and a root-prepared intent. Class V: every other run reuses saved proofs after rechecking bindings and Docker absence.
 * A missing or stale proof fails; it is never skipped and never re-dispatched automatically.
 */
const required=process.env.ATLAS_NATIVE_STOP_REQUIRED==='1'
if(required&&process.platform!=='win32')throw Error('Native stop proof requires Windows')
const DISPATCH=process.env.ATLAS_NATIVE_STOP_DISPATCH??null
const ROOT=resolve(__dirname,'../../../..'),PLAN='docs/superpowers/plans/2026-10-19-cooperative-native-stop.md',WS=join(ROOT,'.superpowers/sdd/2026-10-19-cooperative-native-stop')
const DOTNET='C:\\Program Files\\dotnet\\dotnet.exe',DOCKER='C:/Program Files/Docker/Docker/resources/bin/docker.exe'
const HELPER=join(ROOT,'apps/code-broker/.native/windows-workspace/OmniraBrokerWorkspace.dll'),SMOKE=join(ROOT,'apps/code-broker/native/windows-workspace/smoke/bin/Release/net8.0-windows/WorkspaceSmoke.dll')
const ATTEMPTS=['A','B','C','D'] as const
type Attempt=typeof ATTEMPTS[number]
function workspace(){if(!existsSync(join(WS,'plan-path'))||readFileSync(join(WS,'plan-path'),'utf8').trim()!==PLAN)throw Error('owned_plan_workspace_missing');return WS}
const request=()=>JSON.parse(readFileSync(join(ROOT,'docs/verification/2026-10-19-materialization-planning-evidence.json'),'utf8')).retainedWorkspace.request
const raw=(p:string)=>createHash('sha256').update(readFileSync(join(ROOT,p))).digest('hex')
const textHash=(p:string)=>createHash('sha256').update(readFileSync(join(ROOT,p),'utf8').replaceAll('\r\n','\n')).digest('hex')
/** Exact code/binary bindings a saved real proof depends on. Environment identity is rechecked by the absence observer. */
function bindings(){
 const helper=['apps/code-broker/.native/windows-workspace/OmniraBrokerWorkspace.dll','apps/code-broker/.native/windows-workspace/OmniraBrokerWorkspace.deps.json','apps/code-broker/.native/windows-workspace/OmniraBrokerWorkspace.runtimeconfig.json','apps/code-broker/.native/windows-workspace/OmniraBrokerHost.dll']
 const sources=['apps/code-broker/native/windows-workspace/Program.cs','apps/code-broker/native/windows-workspace/NativeControlChannel.cs','apps/code-broker/native/windows-workspace/WindowsMaterializationFixture.cs','apps/code-broker/native/windows-workspace/MaterializationContracts.cs','apps/code-broker/src/isolation/windows/controlled-helper.ts','apps/code-broker/src/runtime/native-stop-bridge.ts','apps/code-broker/src/isolation/windows/source-fixture.ts','apps/code-broker/src/isolation/windows/source-contracts.ts','apps/code-broker/src/runtime/execution-lease-guard.ts','apps/code-broker/src/isolation/windows/workspace-helper.ts']
 return{...Object.fromEntries(helper.map(p=>[p,raw(p)])),...Object.fromEntries(sources.map(p=>[p,textHash(p)])),request:JSON.stringify(request())}
}
function docker(args:string[]){return execFileSync(DOCKER,['--config',join(workspace(),'docker-config'),'--host','npipe:////./pipe/dockerDesktopLinuxEngine',...args],{env:{NODE_ENV:'test',SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32'},encoding:'utf8',timeout:60000}).trim()}
const snapshot=()=>({containers:docker(['ps','-aq','--no-trunc']).split(/\r?\n/).filter(Boolean).sort(),volumes:docker(['volume','ls','-q']).split(/\r?\n/).filter(Boolean).sort()})
function smoke(mode:string,input:unknown):Promise<any>{
 return new Promise((res,rej)=>{const c=spawn(DOTNET,[SMOKE,mode],{cwd:ROOT,shell:false,windowsHide:true});let out='',err=''
  c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',rej);c.on('close',code=>code===0&&err===''?res(JSON.parse(out)):rej(Error('smoke '+mode+' '+code+' '+err+' '+out)));c.stdin.end(JSON.stringify(input))})
}
/** Pinned environment for proof reuse (plan: Proof binding for reuse). Backend identity is per Docker process and deliberately excluded. */
const DAEMON_IDENTITY='097b04099237066832a5574e26cb1708df26ff5007ae0165f7135bea76df3601',SOURCE_IMAGE='sha256:354e46f6c5d5e046a2002b78f2d43931824b67110df42a40ab4204e269d1acd0'
function checkEnvironment(x:string,proof:any,again:any){
 const saved=proof?.observedAbsence??{}
 if(saved.daemonIdentityHash!==DAEMON_IDENTITY||again?.daemonIdentityHash!==DAEMON_IDENTITY)throw Error('stale_real_evidence:'+x+':daemonIdentityHash')
 if(typeof saved.toolchainProfileHash!=='string'||!/^[a-f0-9]{64}$/.test(saved.toolchainProfileHash)||again?.toolchainProfileHash!==saved.toolchainProfileHash)throw Error('stale_real_evidence:'+x+':toolchainProfileHash')
 const native=proof?.run?.native
 if(native?.kind==='report'&&native.value?.imageId!==SOURCE_IMAGE)throw Error('stale_real_evidence:'+x+':imageId')
}
const absence=(attemptId:string)=>smoke('check-materialization-absence',{...request(),schema:'sdf.windows_materialization_request.v1',attemptId})
/** Lease template bound to the retained request's binding; fresh server times are stamped per read. */
function template(){const l:any=leaseFixture();l.binding={workId:request().workId,repositoryId:request().repositoryId,pinnedBaseSha:request().pinnedBaseSha,admissionHash:request().admissionHash,claimId:request().claimId,fence:request().fence};return l}
function realGuard(refuse:()=>boolean){
 let counter=1;const t=template(),lease=()=>{const now=Date.now();return{...t,serverNowMs:now,leaseUntilMs:now+90000,authorizationExpiresAtMs:now+300000,runtimeExpiresAtMs:now+1200000}}
 return createExecutionLeaseGuard({claim:{workId:t.binding.workId,claimId:t.binding.claimId,fence:t.binding.fence,claimToken:'A'.repeat(43),requestCounter:1,leaseUntil:new Date(Date.now()+90000).toISOString()},expected:{projectId:t.projectId,binding:t.binding,authorityPins:t.authorityPins}},
  {monotonicNow:()=>performance.now(),wallNow:()=>Date.now(),nextCounter:()=>++counter,schedule:(fn,ms)=>{const h=setTimeout(fn,ms);return()=>clearTimeout(h)},
   read:async c=>(refuse()?{requestCounter:c,httpStatus:409,body:{status:'unavailable',reason:'lease_not_live'}}:{requestCounter:c,httpStatus:200,body:{status:'live',lease:lease()}}) as any})
}
/** In-process real attempt (A, B, D): actual helper, Docker, reservation and cleanup; only the lease read is synthetic. */
async function inProcess(x:'A'|'B'|'D',attemptId:string){
 const start=performance.now(),at=()=>Math.round(performance.now()-start),events:any[]=[],state:{phase:string|null;startAt:number|null;proc:any;native:any;cleanups:number}={phase:null,startAt:null,proc:null,native:null,cleanups:0}
 const guard=realGuard(()=>{
  const refuse=x==='A'?state.phase==='before_volume_create':x==='B'?state.phase==='before_start'&&state.startAt!==null&&at()-state.startAt>=2000:false
  events.push({event:'lease_read',phase:state.phase,refuse,at:at()});return refuse
 })
 guard.signal.addEventListener('abort',()=>events.push({event:'guard_aborted',at:at()}))
 const bridge=createNativeStopBridge({platform:process.platform,nextAttempt:()=>attemptId,reserve:reserveWindowsSourceAttempt,
  cleanup:async(i,a)=>{state.cleanups++;events.push({event:'cleanup_called',at:at()});const r=await cleanupWindowsSourceFixture(i,a);events.push({event:'cleanup_result',result:r,at:at()});return r},
  schedule:(fn,ms)=>{const h=setTimeout(fn,ms);return()=>clearTimeout(h)},
  launch:(payload,handlers)=>{
   const r=launchControlledMaterialization(payload,{checkpoint:(seq,phase)=>{state.phase=phase;if(phase==='before_start')state.startAt=at();events.push({event:'checkpoint',seq,phase,at:at()});handlers.checkpoint(seq,phase)
    if(x==='D'&&phase==='before_start')setTimeout(()=>{events.push({event:'forced_terminate',pid:state.proc?.pid,at:at()});state.proc?.kill()},3000)}})
   if(r.status!=='launched')return r
   state.proc=r.process;events.push({event:'launched',pid:r.process.pid,at:at()})
   const done=r.process.done.then(o=>{state.native=o;events.push({event:'native_outcome',kind:o.kind,at:at()});return o})
   return{status:'launched',process:{get pid(){return r.process.pid},continue:(n:number)=>r.process.continue(n),stop:()=>{events.push({event:'stop_sent',at:at()});r.process.stop()},kill:()=>r.process.kill(),done}}
  }})
 const result=await bridge(request(),guard);guard.stop()
 return{result,events,native:state.native,cleanups:state.cleanups,elapsedMs:at()}
}
/** Attempt C: a separate real broker process runs the bridge and is killed during the container wait. */
async function parentKill(attemptId:string){
 const start=performance.now(),at=()=>Math.round(performance.now()-start),events:any[]=[]
 const parent=spawn(process.execPath,['--experimental-strip-types','--no-warnings',join(ROOT,'apps/web/lib/qa/fixtures/sdf-native-stop-parent.mjs'),JSON.stringify(request()),attemptId,JSON.stringify(template())],{cwd:ROOT,shell:false,windowsHide:true})
 let helperPid:number|null=null,buffer='',err=''
 parent.stderr.on('data',b=>err+=b)
 const killed=new Promise<void>((res,rej)=>{
  const timer=setTimeout(()=>rej(Error('parent never reached before_start: '+err)),200000)
  parent.stdout.on('data',b=>{buffer+=b;let n;while((n=buffer.indexOf('\n'))>=0){const line=JSON.parse(buffer.slice(0,n));buffer=buffer.slice(n+1);events.push({...line,observedAt:at()})
   if(line.event==='launched')helperPid=line.pid
   if(line.event==='checkpoint'&&line.phase==='before_start')setTimeout(()=>{events.push({event:'parent_killed',parentPid:parent.pid,at:at()});parent.kill();clearTimeout(timer);res()},3000)}})
  parent.on('close',code=>events.push({event:'parent_closed',code,at:at()}))
 })
 await killed
 const alive=(pid:number)=>{try{process.kill(pid,0);return true}catch{return false}}
 await new Promise(r=>setTimeout(r,300))
 const helperAliveAfterParentKill=helperPid!==null&&alive(helperPid)
 let exitedAfterMs:number|null=null
 for(let n=0;n<240;n++){if(helperPid===null||!alive(helperPid)){exitedAfterMs=at();break}await new Promise(r=>setTimeout(r,250))}
 return{events,helperPid,helperAliveAfterParentKill,helperExitedAt:exitedAfterMs,parentStderr:err,elapsedMs:at()}
}
describe.runIf(required&&process.platform==='win32')('cooperative native stop: real process evidence',()=>{
 it('class V: environment drift (daemon, toolchain profile, image) makes saved real evidence stale',async()=>{
  expect(typeof checkEnvironment).toBe('function')
  // The controlled spawn uses workspace-helper's fixed runtime, environment and bootstrap check: it is part of what a proof proves.
  expect(Object.keys(bindings())).toContain('apps/code-broker/src/isolation/windows/workspace-helper.ts')
  const proof={attempt:'A',observedAbsence:{daemonIdentityHash:DAEMON_IDENTITY,toolchainProfileHash:'d'.repeat(64)},run:{native:{kind:'report',value:{imageId:SOURCE_IMAGE}}}}
  const again={daemonIdentityHash:DAEMON_IDENTITY,toolchainProfileHash:'d'.repeat(64)}
  expect(()=>checkEnvironment('A',proof,again)).not.toThrow()
  expect(()=>checkEnvironment('A',proof,{...again,daemonIdentityHash:'e'.repeat(64)})).toThrow('stale_real_evidence:A:daemonIdentityHash')
  expect(()=>checkEnvironment('A',{...proof,observedAbsence:{...proof.observedAbsence,daemonIdentityHash:'e'.repeat(64)}},{...again,daemonIdentityHash:'e'.repeat(64)})).toThrow('stale_real_evidence:A:daemonIdentityHash')
  expect(()=>checkEnvironment('A',proof,{...again,toolchainProfileHash:'f'.repeat(64)})).toThrow('stale_real_evidence:A:toolchainProfileHash')
  expect(()=>checkEnvironment('B',{...proof,run:{native:{kind:'report',value:{imageId:'sha256:'+'0'.repeat(64)}}}},again)).toThrow('stale_real_evidence:B:imageId')
  expect(()=>checkEnvironment('C',{...proof,run:{}},again)).not.toThrow()
 })
 it('class V: the real helper refuses malformed first control lines before any reservation, source read or Docker call',async()=>{
  const attempts=()=>readdirSync(join(ROOT,'apps/code-broker/.native/windows-workspace/attempts')).length,before=attempts()
  for(const input of ['{bad\n',' '.repeat(4097)+'\n','{"schema":"bad"}\n',JSON.stringify({...request(),schema:'sdf.windows_materialization_request.v1',attemptId:'../x'})+'\n','no newline at all']){
   const r=await new Promise<{code:number|null;out:string}>(res=>{const c=spawn(DOTNET,[HELPER,'materialize-fixture'],{cwd:ROOT,shell:false,windowsHide:true});let out='';c.stdout.on('data',b=>out+=b);c.stdin.on('error',()=>{});c.on('close',code=>res({code,out}));c.stdin.end(input)})
   expect(r.code,input.slice(0,20)).not.toBe(0);expect(r.out).toBe('')
  }
  expect(attempts()).toBe(before)
 },60000)
 for(const x of ATTEMPTS)it('class N attempt '+x+': dispatched at most once, then only reused with matching bindings and rechecked absence',async()=>{
  const ws=workspace(),proofPath=join(ws,'n-'+x+'-proof.json'),intentPath=join(ws,'n-'+x+'-intent.json')
  if(DISPATCH===x){
   if(existsSync(proofPath))throw Error('attempt '+x+' already has a proof; never dispatch again')
   const intent=JSON.parse(readFileSync(intentPath,'utf8'))
   if(intent.attempt!==x||intent.phase!=='prepared'||typeof intent.attemptId!=='string')throw Error('attempt '+x+' is not prepared or was already dispatched; reconcile, never replay')
   writeFileSync(intentPath,JSON.stringify({...intent,phase:'dispatched-once',dispatchedAt:new Date().toISOString()},null,2))
   const dockerBefore=snapshot(),boundAtDispatch=bindings()
   const run=x==='C'?await parentKill(intent.attemptId):await inProcess(x,intent.attemptId)
   const dockerAfter=snapshot()
   let observedAbsence:any=null,absenceError:string|null=null
   try{observedAbsence=await absence(intent.attemptId)}catch(e){absenceError=String(e)}
   writeFileSync(proofPath,JSON.stringify({schema:'atlas.native_stop_real_attempt.v1',attempt:x,attemptId:intent.attemptId,recordedAt:new Date().toISOString(),bindings:boundAtDispatch,dockerBefore,dockerAfter,run,observedAbsence,absenceError,productionAuthority:false},null,2),{flag:'wx'})
  }
  if(!existsSync(proofPath))throw Error('missing class N proof '+x+' (no dispatch authorized in this run)')
  const proof=JSON.parse(readFileSync(proofPath,'utf8')),now=bindings()
  for(const [key,value] of Object.entries(now))if(proof.bindings[key]!==value)throw Error('stale_real_evidence:'+x+':'+key)
  expect(proof.observedAbsence?.absent,proof.absenceError??'').toBe(true)
  const leftovers=(list:string[])=>list.filter(v=>v.includes(proof.attemptId.replaceAll('-',''))||v.includes(proof.attemptId))
  expect(leftovers(proof.dockerAfter.volumes)).toEqual([]);expect(proof.dockerAfter.containers.filter((id:string)=>!proof.dockerBefore.containers.includes(id))).toEqual([])
  const phases=(proof.run.events as any[]).filter(e=>e.event==='checkpoint').map(e=>e.phase)
  if(x==='A'){expect(phases).toEqual(['before_resources','before_volume_create']);expect(proof.run.result).toEqual({status:'stopped',attemptId:proof.attemptId,reason:'lease_lost',cleanup:'confirmed',containerRemoved:true,volumeRemoved:true});expect(proof.run.native.kind).toBe('report');expect(proof.run.native.value.status).toBe('stopped');expect(proof.run.cleanups).toBe(0)}
  if(x==='B'){expect(phases).toEqual(['before_resources','before_volume_create','before_container_create','before_upload','before_start']);expect(proof.run.result).toMatchObject({status:'stopped',reason:'lease_lost',cleanup:'confirmed'});expect(proof.run.native.value.status).toBe('stopped');expect(proof.run.native.value.containerRemoved&&proof.run.native.value.volumeRemoved).toBe(true);expect(proof.run.cleanups).toBe(0)}
  if(x==='C'){expect(phases).toContain('before_start');expect(proof.run.helperAliveAfterParentKill).toBe(true);expect(proof.run.helperExitedAt).not.toBeNull();expect(proof.run.events.some((e:any)=>e.event==='result')).toBe(false)}
  if(x==='D'){expect(phases).toContain('before_start');expect(proof.run.events.some((e:any)=>e.event==='forced_terminate')).toBe(true);expect(proof.run.native.kind).toBe('violation');expect(proof.run.cleanups).toBe(1);expect(proof.run.result).toMatchObject({status:'stopped',reason:'control_lost',cleanup:'confirmed',containerRemoved:true,volumeRemoved:true})}
  // Recheck absence now on the original peer; the observer never creates, starts or removes anything.
  const again=await absence(proof.attemptId);expect(again.absent).toBe(true);expect(again.productionAuthority).toBe(false);checkEnvironment(x,proof,again)
 },300000)
})
