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
