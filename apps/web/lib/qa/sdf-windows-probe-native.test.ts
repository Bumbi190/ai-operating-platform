import {execFile} from 'node:child_process'
import {mkdirSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {promisify} from 'node:util'
import {beforeAll,describe,it,expect} from 'vitest'
import {runWindowsSandboxHealthProbe,cleanupWindowsSandboxHealthProbe} from '../../../code-broker/src/isolation/windows/workspace'
import {WINDOWS_PROBE_PROTECTIONS} from '../../../code-broker/src/isolation/windows/workspace-contracts'
import {SANDBOX_SPEC} from '../../../code-broker/src/isolation/sandbox-spec'
const required=process.env.SDF_WINDOWS_PROBE_REQUIRED==='1'
if(required&&process.platform!=='win32')throw Error('Windows sandbox proof requires Windows')
const ROOT=resolve(__dirname,'../../../..'),WS=join(ROOT,'.superpowers/sdd/2026-10-18-windows-workspace-sandbox')
const DOTNET='C:\\Program Files\\dotnet\\dotnet.exe',SMOKE=join(ROOT,'apps/code-broker/native/windows-workspace/smoke/bin/Release/net8.0-windows/WorkspaceSmoke.dll')
const exec=promisify(execFile)
describe.runIf(required&&process.platform==='win32')('real fixed Windows sandbox',()=>{
 beforeAll(()=>mkdirSync(WS,{recursive:true}))
 it('proves actual facade/helper/peer/container execution and confirmed removal',async()=>{
  const result=await runWindowsSandboxHealthProbe();writeFileSync(join(WS,'real-probe-proof.json'),JSON.stringify(result,null,2))
  expect(result.status).toBe('observed')
  if(result.status!=='observed')throw Error('real probe unavailable: '+result.reason)
  expect(result.report.status).toBe('ok');expect(result.report.uid).toBe(10001);expect(result.report.gid).toBe(10001)
  expect(result.report.inspected).toEqual(WINDOWS_PROBE_PROTECTIONS);expect(result.report.containerRemoved).toBe(true);expect(result.report.productionAuthority).toBe(false)
 },45000)
 it('compares the actual native create specification to the existing fixed SandboxSpec',async()=>{
  const{stdout}=await exec(DOTNET,[SMOKE,'probe-spec'],{cwd:ROOT,shell:false,windowsHide:true,timeout:5000,maxBuffer:262144});const actual=JSON.parse(stdout)
  expect(actual).toMatchObject({User:SANDBOX_SPEC.user,Cmd:['id'],Entrypoint:['/bin/busybox'],WorkingDir:SANDBOX_SPEC.workdir,Tty:false,OpenStdin:false,HostConfig:{NetworkMode:'none',CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],ReadonlyRootfs:true,Privileged:false,PidsLimit:SANDBOX_SPEC.pidsLimit,Memory:SANDBOX_SPEC.memoryBytes,MemorySwap:SANDBOX_SPEC.memoryBytes,NanoCpus:SANDBOX_SPEC.nanoCpus,Binds:[],Mounts:[],Devices:[],PortBindings:{}}})
  expect(actual.HostConfig.Tmpfs).toEqual(SANDBOX_SPEC.tmpfs);expect(actual.Env).toEqual(['HOME=/tmp','LANG=C.UTF-8'])
 })
 it('independently reads an actual owned not-started container and reconciles it only by its attempt',async()=>{
  const attemptId=randomUUID();const receipt=join(WS,'retained-probe-'+attemptId+'.json');writeFileSync(receipt,JSON.stringify({attemptId,phase:'creating'}))
  try{
   const command=exec(DOTNET,[SMOKE,'create-probe'],{cwd:ROOT,shell:false,windowsHide:true,timeout:30000,maxBuffer:262144})
   command.child.stdin!.end(JSON.stringify({attemptId}))
   const{stdout}=await command;const actual=JSON.parse(stdout);writeFileSync(receipt,JSON.stringify(actual,null,2))
   expect(actual).toMatchObject({attemptId,retained:true,state:'created',productionAuthority:false,mounts:[],config:{user:'10001:10001',cmd:['id'],entrypoint:['/bin/busybox'],workingDir:'/tmp',tty:false},host:{network:'none',readonlyRootfs:true,privileged:false,capDrop:['ALL'],pids:64,memory:134217728,swap:134217728,cpus:500000000}})
   expect(actual.config.env.sort()).toEqual(['HOME=/tmp','LANG=C.UTF-8','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'].sort())
   const result=await cleanupWindowsSandboxHealthProbe(attemptId);writeFileSync(receipt,JSON.stringify({actual,cleanup:result},null,2))
   expect(result.status).toBe('observed');if(result.status==='observed'){expect(result.report.status).toBe('cleaned');expect(result.report.containerRemoved).toBe(true);expect(result.report.uid).toBeNull()}
  }finally{
   const cleanup=await cleanupWindowsSandboxHealthProbe(attemptId)
   if(cleanup.status!=='observed'||!cleanup.report.containerRemoved)throw Error('Owned probe cleanup is retained: '+attemptId)
  }
 },60000)
 it('runs all required native lost-response/peer/timeout/protection cases',async()=>{
  const{stdout}=await exec(DOTNET,[SMOKE,'probe'],{cwd:ROOT,shell:false,windowsHide:true,timeout:60000,maxBuffer:262144});const result=JSON.parse(stdout)
  expect(result.passed).toBe(result.names.length)
  for(const name of ['wrong_peer_receives_zero_http','blocked_host_has_zero_http_mutations','changed_peer_before_mutation_refused','lost_create_reply_owned_cleanup','foreign_same_name_never_removed','lost_delete_reply_verified_absent','cleanup_failure_not_ok','overall_probe_deadline_includes_cleanup','actual_cleanup_of_absent_attempt_has_no_probe_claim','late_daemon_before-delete_never_confirms_cleanup','late_daemon_cleanup-absence_never_confirms_cleanup','late_daemon_lost-delete-drift_never_confirms_cleanup','cleanup_only_changed_daemon_absence_not_cleaned'])expect(result.names).toContain(name)
 },65000)
})