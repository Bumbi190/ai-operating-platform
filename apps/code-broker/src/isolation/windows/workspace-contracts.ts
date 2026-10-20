export const WINDOWS_PROBE_PROTECTIONS=Object.freeze([
 'network=none','rootfs=read-only','user=non-root numeric','cap-drop=ALL','no-new-privileges','not privileged',
 'pids-limit','memory limit','swap bounded','cpu limit','no bind mounts','no mounts','no docker socket',
 'tmpfs only /tmp noexec','env allowlist','no secret env','image=pinned digest','image id matches','no devices',
 'no host namespaces','no published ports','fixed entrypoint',
] as const)
export const WORKSPACE_REASONS=Object.freeze(['input_invalid','host_unqualified','repository_unknown','unsafe_path','unsafe_git_config','remote_identity_mismatch','base_unavailable','target_exists','branch_exists','worktree_conflict','evidence_changed','git_unavailable','git_timeout','git_output_limit','worktree_add_failed','verification_failed','cleanup_retained'] as const)
export const PROBE_REASONS=Object.freeze(['host_unqualified','image_missing','image_invalid','peer_changed','protocol_invalid','protection_missing','probe_failed','deadline_exceeded','cleanup_retained'] as const)
export interface WorkspaceRequest {schema:'sdf.windows_workspace_request.v1';workId:string;repositoryId:string;pinnedBaseSha:string;admissionHash:string;claimId:string;fence:number}
export type WorkspaceBinding=Omit<WorkspaceRequest,'schema'>
interface ReportRoot {schema:'sdf.windows_workspace_report.v1';productionAuthority:false}
export type WorkspaceReport=ReportRoot&(
 {status:'prepared';binding:WorkspaceBinding;observedBaseSha:string;headSha:string;branchName:string;worktreePathHash:string;remoteIdentityHash:string;workspaceIdentityHash:string;observedAt:string;workspaceRetained:true}|
 {status:'refused';reason:typeof WORKSPACE_REASONS[number];workspaceRetained:false}|
 {status:'failed';reason:typeof WORKSPACE_REASONS[number];workspaceRetained:boolean}|
 {status:'stale_base';pinnedBaseSha:string;observedBaseSha:string;workspaceRetained:false})
export interface ProbeReport {
 schema:'sdf.windows_sandbox_probe.v1';status:'ok'|'cleaned'|'blocked'|'failed';attemptId:string;reason:typeof PROBE_REASONS[number]|null;
 backendIdentityHash:string|null;daemonIdentityHash:string|null;imageId:string|null;containerId:string|null;uid:number|null;gid:number|null;inspected:string[];containerRemoved:boolean;productionAuthority:false
}
export type TransportReason='unsupported_platform'|'input_invalid'|'helper_unavailable'|'helper_failed'|'deadline_exceeded'|'response_too_large'|'invalid_report'
export type WorkspaceReadResult={status:'observed';report:WorkspaceReport}|{status:'unavailable';reason:TransportReason}
export type ProbeReadResult={status:'observed';report:ProbeReport}|{status:'unavailable';reason:TransportReason;attemptId:string|null}
const requestKeys=['workId','repositoryId','pinnedBaseSha','admissionHash','claimId','fence']
const probeKeys=['schema','status','attemptId','reason','backendIdentityHash','daemonIdentityHash','imageId','containerId','uid','gid','inspected','containerRemoved','productionAuthority']
function ensure(value:unknown):asserts value{if(!value)throw Error('invalid Windows workspace contract')}
function record(value:unknown):Record<string,unknown>{ensure(value&&typeof value==='object'&&!Array.isArray(value));return value as Record<string,unknown>}
function keys(value:Record<string,unknown>,expected:readonly string[]){ensure(Object.keys(value).sort().join(',')===[...expected].sort().join(','))}
const hex=(v:unknown,n:number):v is string=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v)
export const isWorkspaceUuid=(v:unknown,v4=false):v is string=>typeof v==='string'&&(v4?/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/:/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/).test(v)
function binding(x:Record<string,unknown>){
 ensure(isWorkspaceUuid(x.workId,true)&&isWorkspaceUuid(x.claimId)&&hex(x.pinnedBaseSha,40)&&hex(x.admissionHash,64))
 ensure(typeof x.repositoryId==='string'&&x.repositoryId.length>0&&x.repositoryId.length<=256)
 ensure(typeof x.fence==='number'&&Number.isSafeInteger(x.fence)&&x.fence>=1)
}
const copy=<T>(value:unknown):T=>JSON.parse(JSON.stringify(value))
export function parseWindowsWorkspaceRequest(input:unknown):WorkspaceRequest{
 const x=record(input);keys(x,['schema',...requestKeys]);ensure(x.schema==='sdf.windows_workspace_request.v1');binding(x);return copy(x)
}
export function parseWindowsWorkspaceReport(input:unknown):WorkspaceReport{
 const x=record(input);ensure(x.schema==='sdf.windows_workspace_report.v1'&&x.productionAuthority===false)
 const base=['schema','status','productionAuthority','workspaceRetained']
 if(x.status==='prepared'){
  keys(x,[...base,'binding','observedBaseSha','headSha','branchName','worktreePathHash','remoteIdentityHash','workspaceIdentityHash','observedAt'])
  const b=record(x.binding);keys(b,requestKeys);binding(b)
  ensure(b.repositoryId==='github.com/bumbi190/ai-operating-platform'&&x.workspaceRetained===true&&x.headSha===b.pinnedBaseSha&&x.observedBaseSha===b.pinnedBaseSha&&x.branchName==='sdf1/'+b.workId)
  ensure(hex(x.worktreePathHash,64)&&hex(x.remoteIdentityHash,64)&&hex(x.workspaceIdentityHash,64))
  ensure(typeof x.observedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x.observedAt)&&Number.isFinite(Date.parse(x.observedAt))&&new Date(x.observedAt).toISOString()===x.observedAt)
 }else if(x.status==='stale_base'){
  keys(x,[...base,'pinnedBaseSha','observedBaseSha']);ensure(x.workspaceRetained===false&&hex(x.pinnedBaseSha,40)&&hex(x.observedBaseSha,40)&&x.pinnedBaseSha!==x.observedBaseSha)
 }else{
  keys(x,[...base,'reason']);ensure((x.status==='refused'||x.status==='failed')&&(WORKSPACE_REASONS as readonly unknown[]).includes(x.reason)&&typeof x.workspaceRetained==='boolean')
  if(x.status==='refused')ensure(x.workspaceRetained===false)
 }
 return copy(x)
}
export function parseWindowsSandboxProbeReport(input:unknown):ProbeReport{
 const x=record(input);keys(x,probeKeys);ensure(x.schema==='sdf.windows_sandbox_probe.v1'&&x.productionAuthority===false&&isWorkspaceUuid(x.attemptId,true)&&typeof x.containerRemoved==='boolean')
 for(const key of ['backendIdentityHash','daemonIdentityHash','containerId'])ensure(x[key]===null||hex(x[key],64))
 ensure(x.imageId===null||(typeof x.imageId==='string'&&/^sha256:[a-f0-9]{64}$/.test(x.imageId)))
 ensure(Array.isArray(x.inspected)&&x.inspected.length<=WINDOWS_PROBE_PROTECTIONS.length&&x.inspected.every(v=>typeof v==='string'))
 if(x.daemonIdentityHash!==null)ensure(x.backendIdentityHash!==null)
 if(x.imageId!==null)ensure(x.backendIdentityHash!==null&&x.daemonIdentityHash!==null)
 if(x.containerId!==null)ensure(x.imageId!==null)
 if(x.status==='ok'){
  ensure(x.reason===null&&x.uid===10001&&x.gid===10001&&x.containerRemoved===true&&x.backendIdentityHash!==null&&x.daemonIdentityHash!==null&&x.imageId!==null&&x.containerId!==null)
  ensure(JSON.stringify(x.inspected)===JSON.stringify(WINDOWS_PROBE_PROTECTIONS))
 }else{
  ensure(x.uid===null&&x.gid===null&&x.inspected.length===0)
  if(x.status==='cleaned')ensure(x.reason===null&&x.containerRemoved===true&&x.backendIdentityHash!==null&&x.daemonIdentityHash!==null)
  else ensure((x.status==='blocked'||x.status==='failed')&&(PROBE_REASONS as readonly unknown[]).includes(x.reason))
 }
 return copy(x)
}
