import type {SourceManifest} from '../../../../code-broker/src/isolation/windows/source-contracts'
export const sourceFixturePaths=[
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
] as const
export function makeSourceManifest():SourceManifest{return {
 schema:'sdf.windows_source_manifest.v1',
 binding:{workId:'c435e423-d964-428b-b5c0-4060d89ce3c6',repositoryId:'github.com/bumbi190/ai-operating-platform',pinnedBaseSha:'b'.repeat(40),admissionHash:'a'.repeat(64),claimId:'2e0f09eb-cf7e-4619-834b-d78aa0ca5a7a',fence:1},
 policyId:'sdf.windows_source_fixture.v1',baseSha:'b'.repeat(40),
 files:sourceFixturePaths.map(path=>({path,gitBlobId:'c'.repeat(40),sha256:'d'.repeat(64),byteLength:10}))
}}
import {createHash} from 'node:crypto'
import {canonicalSourceManifest} from '../../../../code-broker/src/isolation/windows/source-contracts'
export function makeMaterializationReport(){
 const manifest=makeSourceManifest(),hash=createHash('sha256').update(canonicalSourceManifest(manifest)).digest('hex')
 return {schema:'sdf.windows_materialization_report.v1',status:'verified_for_fixture',attemptId:'33333333-3333-4333-8333-333333333333',binding:manifest.binding,reason:null,sourcePolicyId:'sdf.windows_source_fixture.v1',manifest,manifestSha256:hash,toolchainProfileHash:'e'.repeat(64),imageId:'sha256:'+'f'.repeat(64),backendIdentityHash:'a'.repeat(64),daemonIdentityHash:'b'.repeat(64),fixture:{schema:'sdf.node_fixture_result.v1',uid:10001,gid:10001,nodeVersion:'22.23.3',typeScriptVersion:'5.9.3',vitestVersion:'2.1.9',totalTests:1,passedTests:1,failedTests:0,skippedTests:0,exitCode:0,durationMs:10,sourceManifestSha256:hash,beforeAfterSourceEqual:true,stdoutSha256:'c'.repeat(64),stderrSha256:'d'.repeat(64),redactedStdout:'',redactedStderr:''},containerRemoved:true,volumeRemoved:true,observedAt:'2026-10-19T08:00:00.000Z',productionAuthority:false}
}
export function makeMaterializationCleanup(){const r:any=makeMaterializationReport();return {...r,status:'cleaned',manifest:null,manifestSha256:null,fixture:null,imageId:null}}
