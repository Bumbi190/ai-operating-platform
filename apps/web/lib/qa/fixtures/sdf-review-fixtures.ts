import type { ExpectedReviewContext } from '@/lib/atlas/code-work/review/types'
import { codeWorkAdmissionHash } from '@/lib/atlas/code-work/binding'
import { codeWorkCommandRegistryHash,COMMAND_REGISTRY_VERSION,resolveCommandInvocation } from '@/lib/atlas/code-work/command-registry'
import { canonicalTargetVersionHash } from '@/lib/atlas/authorization/build'
import * as T from '@/lib/atlas/code-work/types'
import { reviewPolicyHash, reviewSettingsHash } from '@/lib/atlas/code-work/review/binding'
import { REVIEW_CONTRACT_LIMITS } from '@/lib/atlas/code-work/review/types'
export const H='a'.repeat(64),BASE='b'.repeat(40),NOW=Date.parse('2026-10-18T18:00:00.000Z')
export function makeAdmission():T.CodeWorkAdmissionV1{return{
 schema:T.CODE_WORK_ADMISSION_SCHEMA,version:1,workId:'work-review-1',projectId:'project-1',
 governance:{mission:{id:'mission-1',version:1,hash:H},authorizationTarget:{targetType:T.CODE_WORK_AUTHORIZATION_TARGET_TYPE,targetId:'work-review-1',actionKind:T.CODE_WORK_AUTHORIZATION_ACTION_KIND},delegation:{envelopeId:'delegation-1',hash:H},workPackage:{id:'package-1',hash:H}},
 repository:{repositoryId:'github.com/bumbi190/ai-operating-platform',owner:'Bumbi190',name:'ai-operating-platform',expectedRemote:{provider:'github',host:'github.com',owner:'bumbi190',name:'ai-operating-platform'},pinnedBaseSha:BASE,approvedRemote:'origin',approvedBaseRef:'refs/remotes/origin/main'},
 worktree:{branchPrefix:'sdf1/',policyId:T.CODE_WORK_WORKTREE_POLICY_ID},
 worker:{capabilityId:T.CODE_WORK_CAPABILITY_ID,capabilityVersion:1,adapterId:T.CODE_WORK_WORKER_ADAPTER_ID,adapterVersion:1,provider:'anthropic',modelId:'claude-sonnet-4-6',outputProtocol:T.CODE_WORK_OUTPUT_PROTOCOL},
 files:{readScopes:['apps/web/lib'],writeScopes:['apps/web/lib/atlas/code-work'],deniedScopes:['apps/web/lib/atlas/code-work/private'],permissions:{create:true,update:true,delete:false,rename:false}},
 commands:{approvedCommandIds:['sdf1.proof.fixture_test','sdf1.proof.typecheck'],registryVersion:COMMAND_REGISTRY_VERSION,registryHash:codeWorkCommandRegistryHash()},
 limits:{...T.SDF1_LIMITS},isolation:{network:'denied',secrets:'none'},evidence:{requiredReceiptClasses:[...T.CODE_WORK_BASELINE_RECEIPT_CLASSES]},stopConditions:[...T.CODE_WORK_STOP_CONDITIONS],
}}
export function makeReviewAssignment(){return{workId:'work-review-1',projectId:'project-1',coordinator:{actorId:'atlas',sessionId:'atlas-session'},worker:{actorId:'worker',sessionId:'worker-session'},reviewer:{actorId:'reviewer',sessionId:'reviewer-session'},claim:{id:'claim-1',fence:1,expiresAt:'2026-10-18T18:15:00.000Z'},policyHash:reviewPolicyHash()}}
export function makeReviewContext():ExpectedReviewContext{const registryHash=codeWorkCommandRegistryHash();return{
 admission:makeAdmission(),assignment:makeReviewAssignment(),policyHash:reviewPolicyHash(),targetHeadSha:BASE,nowMs:NOW,cancelled:false,claimValid:true,
 requiredChecks:[{commandId:'sdf1.proof.fixture_test',commandVersion:1 as const,arguments:{suite:'lib/qa/sdf1a-code-work-contracts.test.ts'},registryHash,argvHash:canonicalTargetVersionHash(['exec','--','vitest','run','lib/qa/sdf1a-code-work-contracts.test.ts']),minPassedTests:1}],
 limits:{...REVIEW_CONTRACT_LIMITS},budget:{totalMicrousd:100000,reviewerAllocationMicrousd:30000,spentMicrousd:10000,reservedReviewerMicrousd:30000},deadlineMs:NOW+1200000,
}}
export function makeReviewBinding(context=makeReviewContext()){const a=context.admission;return{schema:'atlas.code_review_binding.v1' as const,workId:a.workId,projectId:a.projectId,repositoryId:a.repository.repositoryId,missionId:a.governance.mission.id,missionVersion:a.governance.mission.version,missionHash:a.governance.mission.hash,admissionHash:codeWorkAdmissionHash(a),delegationHash:a.governance.delegation.hash,workPackageHash:a.governance.workPackage.hash,baseSha:a.repository.pinnedBaseSha,targetRef:a.repository.approvedBaseRef,targetHeadSha:context.targetHeadSha,policyHash:context.policyHash,reviewSettingsHash:reviewSettingsHash(context)}}
export function unwrap<T>(r:T|{ok:boolean;value?:unknown;violations?:unknown}):any{if(!(r as any).ok)throw Error(JSON.stringify(r));return(r as any).value}

export function makeSnapshotInput(context=makeReviewContext()):import('@/lib/atlas/code-work/review/types').ReviewSnapshotInputV1{
 const diff='--- a/file\n+++ b/file\n-old\n+new\n',check=context.requiredChecks[0]
 return{schema:'atlas.code_review_snapshot.v1',binding:makeReviewBinding(context),assignment:structuredClone(context.assignment),candidateVersion:1,briefArtifactId:'brief',files:[{path:'apps/web/lib/atlas/code-work/example.ts',beforeArtifactId:'before',afterArtifactId:'after'}],diffArtifactId:'diff',diffBytes:new TextEncoder().encode(diff).byteLength,
 checks:[{commandId:check.commandId,registryHash:check.registryHash,argvHash:check.argvHash,exitCode:0,outcome:'passed',passedTestCount:2,durationMs:100,stdoutArtifactId:'stdout',stderrArtifactId:'stderr'}],
 artifacts:[{id:'brief',kind:'brief',body:'Fix the specified bug.'},{id:'before',kind:'source_before',body:'old'},{id:'after',kind:'source_after',body:'new'},{id:'diff',kind:'diff',body:diff},{id:'stdout',kind:'stdout',body:'2 tests passed'},{id:'stderr',kind:'stderr',body:''}]}
}

export function makeModelResult(snapshotHash:string):import('@/lib/atlas/code-work/review/types').ReviewModelResultV1{return{schema:'atlas.code_review_result.v1',snapshotHash,phase:'final',decision:'passed',findings:[],gaps:[],pendingQuestionIds:[]}}
export function makeFinding():import('@/lib/atlas/code-work/review/types').ReviewFindingV1{return{id:'finding-1',severity:'minor',artifactId:'after',path:'apps/web/lib/atlas/code-work/example.ts',line:1,trigger:'Specific input',impact:'Concrete effect',evidence:'Observed source',suggestedCorrection:'Proposed fix'}}
