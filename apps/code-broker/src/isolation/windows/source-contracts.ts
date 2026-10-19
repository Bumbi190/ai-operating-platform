import {parseWindowsWorkspaceRequest,type WorkspaceBinding} from './workspace-contracts.js'
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
