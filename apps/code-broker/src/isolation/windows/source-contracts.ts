import {createHash} from 'node:crypto'
import {isWorkspaceUuid,parseWindowsWorkspaceRequest,type WorkspaceBinding} from './workspace-contracts.js'
export const SOURCE_FIXTURE_PATHS=Object.freeze([
 "apps/web/lib/atlas/authorization/build.ts",
 "apps/web/lib/atlas/authorization/derive.ts",
 "apps/web/lib/atlas/authorization/types.ts",
 "apps/web/lib/atlas/code-work/binding.ts",
 "apps/web/lib/atlas/code-work/capability.ts",
 "apps/web/lib/atlas/code-work/command-registry.ts",
 "apps/web/lib/atlas/code-work/evidence.ts",
 "apps/web/lib/atlas/code-work/lifecycle.ts",
 "apps/web/lib/atlas/code-work/patch-protocol.ts",
 "apps/web/lib/atlas/code-work/path-policy.ts",
 "apps/web/lib/atlas/code-work/policy.ts",
 "apps/web/lib/atlas/code-work/repository-registry.ts",
 "apps/web/lib/atlas/code-work/terminal-evidence.ts",
 "apps/web/lib/atlas/code-work/types.ts",
 "apps/web/lib/atlas/code-work/worker-registry.ts",
 "apps/web/lib/qa/__stubs__/server-only.ts",
 "apps/web/lib/qa/sdf1a-code-work-contracts.test.ts",
 "apps/web/package.json",
 "apps/web/tsconfig.json",
 "package-lock.json",
 "package.json",
 "packages/local-text-contract/package.json"
] as const)
export interface SourceFileEntry{path:string;gitBlobId:string;sha256:string;byteLength:number}
export interface SourceManifest{schema:'sdf.windows_source_manifest.v1';binding:WorkspaceBinding;policyId:'sdf.windows_source_fixture.v1';baseSha:string;files:SourceFileEntry[]}
function ensure(v:unknown):asserts v{if(!v)throw Error('invalid Windows source manifest')}
function obj(v:unknown):Record<string,unknown>{ensure(v&&typeof v==='object'&&!Array.isArray(v));return v as Record<string,unknown>}
function keys(v:Record<string,unknown>,ks:string[]){ensure(Object.keys(v).sort().join(',')===ks.sort().join(','))}
const hex=(v:unknown,n:number)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v)
export function parseSourceManifest(input:unknown):SourceManifest{
 const x=obj(input);keys(x,['schema','binding','policyId','baseSha','files'])
 ensure(x.schema==='sdf.windows_source_manifest.v1'&&x.policyId==='sdf.windows_source_fixture.v1')
 const b=obj(x.binding);keys(b,['workId','repositoryId','pinnedBaseSha','admissionHash','claimId','fence']);const request=parseWindowsWorkspaceRequest({...b,schema:'sdf.windows_workspace_request.v1'})
 ensure(request.repositoryId==='github.com/bumbi190/ai-operating-platform'&&x.baseSha===request.pinnedBaseSha)
 ensure(Array.isArray(x.files)&&x.files.length===22)
 let total=0
 const files=x.files.map((f:unknown,i:number)=>{const e=obj(f);keys(e,['path','gitBlobId','sha256','byteLength'])
  ensure(e.path===SOURCE_FIXTURE_PATHS[i]&&hex(e.gitBlobId,40)&&hex(e.sha256,64)&&Number.isSafeInteger(e.byteLength)&&Number(e.byteLength)>=0&&Number(e.byteLength)<=1048576)
  total+=Number(e.byteLength);ensure(total<=16777216)
  return {path:e.path as string,gitBlobId:e.gitBlobId as string,sha256:e.sha256 as string,byteLength:e.byteLength as number}
 })
 const binding:WorkspaceBinding={workId:request.workId,repositoryId:request.repositoryId,pinnedBaseSha:request.pinnedBaseSha,admissionHash:request.admissionHash,claimId:request.claimId,fence:request.fence}
 return {schema:'sdf.windows_source_manifest.v1',binding,policyId:'sdf.windows_source_fixture.v1',baseSha:request.pinnedBaseSha,files}
}
export function canonicalSourceManifest(input:unknown):string{return JSON.stringify(parseSourceManifest(input))}

export const MATERIALIZATION_REASONS=['input_invalid','host_unqualified','workspace_unverified','stale_base','source_policy_denied','secret_pattern_found','source_limit','blob_unavailable','toolchain_unprovisioned','toolchain_mismatch','attempt_in_progress','resource_conflict','peer_changed','protocol_invalid','archive_invalid','materialization_unverified','fixture_failed','deadline_exceeded','cleanup_retained'] as const
/** A cooperative stop: no fixture, and both flags mean the attempt's resources are confirmed absent. */
export const STOP_REASONS=['stop_requested','control_lost'] as const
export interface NodeFixtureResult{schema:'sdf.node_fixture_result.v1';uid:10001;gid:10001;nodeVersion:'22.23.3';typeScriptVersion:'5.9.3';vitestVersion:'2.1.9';totalTests:number;passedTests:number;failedTests:0;skippedTests:0;exitCode:0;durationMs:number;sourceManifestSha256:string;beforeAfterSourceEqual:true;stdoutSha256:string;stderrSha256:string;redactedStdout:string;redactedStderr:string}
export interface MaterializationReport{
 schema:'sdf.windows_materialization_report.v1';status:'verified_for_fixture'|'blocked'|'failed'|'cleaned'|'stopped';attemptId:string;binding:WorkspaceBinding;reason:typeof MATERIALIZATION_REASONS[number]|typeof STOP_REASONS[number]|null;sourcePolicyId:'sdf.windows_source_fixture.v1';
 manifest:SourceManifest|null;manifestSha256:string|null;toolchainProfileHash:string|null;imageId:string|null;backendIdentityHash:string|null;daemonIdentityHash:string|null;fixture:NodeFixtureResult|null;containerRemoved:boolean;volumeRemoved:boolean;observedAt:string;productionAuthority:false
}
export type MaterializationReadResult={status:'observed';report:MaterializationReport}|{status:'unavailable';reason:import('./workspace-contracts.js').TransportReason;attemptId:string|null}
function parseFixture(input:unknown,manifestHash:unknown):NodeFixtureResult{
 const x=obj(input);keys(x,['schema','uid','gid','nodeVersion','typeScriptVersion','vitestVersion','totalTests','passedTests','failedTests','skippedTests','exitCode','durationMs','sourceManifestSha256','beforeAfterSourceEqual','stdoutSha256','stderrSha256','redactedStdout','redactedStderr'])
 ensure(x.schema==='sdf.node_fixture_result.v1'&&x.uid===10001&&x.gid===10001&&x.nodeVersion==='22.23.3'&&x.typeScriptVersion==='5.9.3'&&x.vitestVersion==='2.1.9')
 ensure(Number.isSafeInteger(x.totalTests)&&Number(x.totalTests)>0&&x.passedTests===x.totalTests&&x.failedTests===0&&x.skippedTests===0&&x.exitCode===0&&Number.isSafeInteger(x.durationMs)&&Number(x.durationMs)>=0&&Number(x.durationMs)<=90000)
 ensure(x.sourceManifestSha256===manifestHash&&x.beforeAfterSourceEqual===true&&hex(x.stdoutSha256,64)&&hex(x.stderrSha256,64))
 ensure(typeof x.redactedStdout==='string'&&typeof x.redactedStderr==='string'&&Buffer.byteLength(x.redactedStdout,'utf8')+Buffer.byteLength(x.redactedStderr,'utf8')<=65536)
 return JSON.parse(JSON.stringify(x))
}
export function parseMaterializationReport(input:unknown):MaterializationReport{
 const x=obj(input);keys(x,['schema','status','attemptId','binding','reason','sourcePolicyId','manifest','manifestSha256','toolchainProfileHash','imageId','backendIdentityHash','daemonIdentityHash','fixture','containerRemoved','volumeRemoved','observedAt','productionAuthority'])
 ensure(x.schema==='sdf.windows_materialization_report.v1'&&x.sourcePolicyId==='sdf.windows_source_fixture.v1'&&x.productionAuthority===false&&isWorkspaceUuid(x.attemptId,true))
 const b=obj(x.binding);keys(b,['workId','repositoryId','pinnedBaseSha','admissionHash','claimId','fence']);const request=parseWindowsWorkspaceRequest({...b,schema:'sdf.windows_workspace_request.v1'});ensure(request.repositoryId==='github.com/bumbi190/ai-operating-platform')
 for(const k of ['manifestSha256','toolchainProfileHash','backendIdentityHash','daemonIdentityHash'])ensure(x[k]===null||hex(x[k],64))
 ensure(x.imageId===null||(typeof x.imageId==='string'&&/^sha256:[a-f0-9]{64}$/.test(x.imageId)))
 ensure(typeof x.containerRemoved==='boolean'&&typeof x.volumeRemoved==='boolean'&&(!x.volumeRemoved||x.containerRemoved))
 if(x.daemonIdentityHash!==null)ensure(x.backendIdentityHash!==null)
 if(x.imageId!==null)ensure(x.backendIdentityHash!==null&&x.daemonIdentityHash!==null&&x.toolchainProfileHash!==null)
 ensure(typeof x.observedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x.observedAt)&&Number.isFinite(Date.parse(x.observedAt))&&new Date(x.observedAt).toISOString()===x.observedAt)
 if(x.manifest!==null){const m=parseSourceManifest(x.manifest);ensure(Object.keys(b).every(k=>b[k]===(m.binding as unknown as Record<string,unknown>)[k]));ensure(createHash('sha256').update(canonicalSourceManifest(m)).digest('hex')===x.manifestSha256)}else ensure(x.manifestSha256===null)
 if(x.status==='verified_for_fixture'){
  ensure(x.reason===null&&x.manifest!==null&&x.manifestSha256!==null&&x.toolchainProfileHash!==null&&x.imageId!==null&&x.backendIdentityHash!==null&&x.daemonIdentityHash!==null&&x.containerRemoved===true&&x.volumeRemoved===true);parseFixture(x.fixture,x.manifestSha256)
 }else{
  ensure(x.fixture===null)
  if(x.status==='stopped')ensure((STOP_REASONS as readonly unknown[]).includes(x.reason)&&x.containerRemoved===true&&x.volumeRemoved===true)
  else if(x.status==='cleaned')ensure(x.reason===null&&x.manifest===null&&x.manifestSha256===null&&x.containerRemoved===true&&x.volumeRemoved===true&&x.backendIdentityHash!==null&&x.daemonIdentityHash!==null)
  else ensure((x.status==='blocked'||x.status==='failed')&&(MATERIALIZATION_REASONS as readonly unknown[]).includes(x.reason))
 }
 return JSON.parse(JSON.stringify(x))
}
