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
