import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const RUNTIME='C:\\Program Files\\dotnet\\dotnet.exe'
const RUNTIME_SHA256='7967467e8bad9c686de2ab2c1994112d5331a7c3d20f0b8a4fff7480221a1c37'
const HELPER=fileURLToPath(new URL('../../../.native/windows-host/OmniraBrokerHost.dll',import.meta.url))
const IDS=['git','docker','backend','dotnet','checkout','worktree_parent'] as const
export const HOST_REASONS=[
 'unsupported_platform','missing_target','unreadable_target','path_alias','reparse_point','case_sensitive_directory',
 'owner_untrusted','acl_unproven','acl_writable','hash_changed','pipe_unavailable','peer_unproven','peer_changed',
 'docker_unavailable','docker_metadata_invalid','response_too_large','deadline_exceeded','helper_unavailable','helper_failed','invalid_report',
] as const
type Reason=typeof HOST_REASONS[number]
type TargetId=typeof IDS[number]
export interface WindowsHostQualification {
 schema:'sdf.windows_host_qualification.v1'
 profileId:'andre_desktop_windows_v1'
 status:'qualified_for_health_probe'|'blocked'
 observedAt:string
 targetChecks:{id:TargetId;ok:boolean;identityHash:string|null;reasons:Reason[]}[]
 docker:null|{backendIdentityHash:string;daemonIdentityHash:string;osType:'linux';provider:'docker_desktop_wsl2';kernelFamily:'microsoft_wsl2'}
 reasons:Reason[]
}
type TransportReason='unsupported_platform'|'helper_unavailable'|'helper_failed'|'deadline_exceeded'|'response_too_large'|'invalid_report'
export type QualificationReadResult={status:'observed';report:WindowsHostQualification}|{status:'unavailable';reason:TransportReason}
function record(v:unknown):v is Record<string,unknown>{return !!v&&typeof v==='object'&&!Array.isArray(v)}
function keys(v:Record<string,unknown>,expected:string[]):boolean{return Object.keys(v).sort().join(',')===[...expected].sort().join(',')}
function hash(v:unknown):v is string{return typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)}
function reasons(v:unknown):v is Reason[]{return Array.isArray(v)&&v.length<=HOST_REASONS.length&&new Set(v).size===v.length&&v.every(r=>typeof r==='string'&&(HOST_REASONS as readonly string[]).includes(r))}
function invalid():never{throw new Error('invalid host qualification')}
/** Validates shape and consistency, not the truth of host evidence; this is never execution authority. */
export function parseWindowsHostQualification(input:unknown):WindowsHostQualification {
 if(!record(input)||!keys(input,['schema','profileId','status','observedAt','targetChecks','docker','reasons']))invalid()
 if(input.schema!=='sdf.windows_host_qualification.v1'||input.profileId!=='andre_desktop_windows_v1'||!['qualified_for_health_probe','blocked'].includes(input.status as string))invalid()
 if(typeof input.observedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(input.observedAt)||!Number.isFinite(Date.parse(input.observedAt))||new Date(input.observedAt).toISOString()!==input.observedAt)invalid()
 if(!reasons(input.reasons)||!Array.isArray(input.targetChecks)||input.targetChecks.length!==IDS.length)invalid()
 const topReasons=input.reasons
 const seen=new Set<string>();let allOk=true
 for(const t of input.targetChecks){
  if(!record(t)||!keys(t,['id','ok','identityHash','reasons'])||typeof t.id!=='string'||!(IDS as readonly string[]).includes(t.id)||seen.has(t.id)||typeof t.ok!=='boolean'||!reasons(t.reasons))invalid()
  seen.add(t.id)
  if(t.identityHash!==null&&!hash(t.identityHash))invalid()
  if(t.ok){if(t.identityHash===null||t.reasons.length!==0)invalid()}
  else {allOk=false;if(t.reasons.length===0||t.reasons.some(r=>!topReasons.includes(r)))invalid()}
 }
 const d=input.docker
 if(d!==null&&(!record(d)||!keys(d,['backendIdentityHash','daemonIdentityHash','osType','provider','kernelFamily'])||!hash(d.backendIdentityHash)||!hash(d.daemonIdentityHash)||d.osType!=='linux'||d.provider!=='docker_desktop_wsl2'||d.kernelFamily!=='microsoft_wsl2'))invalid()
 const positive=allOk&&d!==null&&input.reasons.length===0
 if(input.status==='qualified_for_health_probe'?!positive:input.reasons.length===0||(allOk&&d!==null))invalid()
 return input as unknown as WindowsHostQualification
}
function checkFile(path:string):void {
 if(realpathSync(path).toLowerCase()!==path.toLowerCase()||!lstatSync(path).isFile())throw Error()
 for(let current=path;;){
  if(lstatSync(current).isSymbolicLink())throw Error()
  const parent=dirname(current);if(parent===current||parent==='.')break;current=parent
 }
}
/** Fixed read-only helper. The reviewed installation and current OS owner are bootstrap trust assumptions. */
export async function readWindowsHostQualification():Promise<QualificationReadResult>{
 if(process.platform!=='win32')return{status:'unavailable',reason:'unsupported_platform'}
 try{
  checkFile(RUNTIME);checkFile(HELPER)
  if(lstatSync(RUNTIME).size>16777216)throw Error()
  const bytes=readFileSync(RUNTIME);if(bytes.length>16777216||createHash('sha256').update(bytes).digest('hex')!==RUNTIME_SHA256)throw Error()
 }catch{return{status:'unavailable',reason:'helper_unavailable'}}
 return new Promise(resolve=>{
  execFile(RUNTIME,[HELPER,'qualify'],{shell:false,windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:262144},(error,stdout,stderr)=>{
   if(error){
    const e=error as NodeJS.ErrnoException&{killed?:boolean}
    const reason:TransportReason=e.code==='ERR_CHILD_PROCESS_STDIO_MAXBUFFER'?'response_too_large':e.killed?'deadline_exceeded':e.code==='ENOENT'?'helper_unavailable':'helper_failed'
    resolve({status:'unavailable',reason});return
   }
   if(Buffer.byteLength(stdout,'utf8')>262144||Buffer.byteLength(stderr,'utf8')>262144){resolve({status:'unavailable',reason:'response_too_large'});return}
   try{resolve({status:'observed',report:parseWindowsHostQualification(JSON.parse(stdout))})}
   catch{resolve({status:'unavailable',reason:'invalid_report'})}
  })
 })
}
