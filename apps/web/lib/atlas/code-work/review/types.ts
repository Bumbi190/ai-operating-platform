import type { CodeWorkAdmissionV1 } from '../types'
export const REVIEW_CONTRACT_LIMITS=Object.freeze({maxReviewSessions:2,maxModelDispatchesPerSession:3,maxMessages:12,maxMessageBodyBytes:4096,maxContextBytes:65536,maxResultBytes:32768})
export interface ReviewBindingV1 {schema:'atlas.code_review_binding.v1';workId:string;projectId:string;repositoryId:string;missionId:string;missionVersion:number;missionHash:string;admissionHash:string;delegationHash:string;workPackageHash:string;baseSha:string;targetRef:string;targetHeadSha:string;policyHash:string;reviewSettingsHash:string}
export type ReviewRole='atlas'|'worker'|'reviewer'
export interface ReviewActor {actorId:string;sessionId:string}
export interface ReviewAssignmentV1 {workId:string;projectId:string;coordinator:ReviewActor;worker:ReviewActor;reviewer:ReviewActor;claim:{id:string;fence:number;expiresAt:string};policyHash:string}
export type ReviewLimits={ -readonly [K in keyof typeof REVIEW_CONTRACT_LIMITS]:number }
/** Supplied observations only: future authenticated server boundaries must derive these, never trust a client projection. */
export interface ExpectedReviewContext {
 admission:CodeWorkAdmissionV1;assignment:ReviewAssignmentV1;policyHash:string;targetHeadSha:string;nowMs:number;cancelled:boolean;claimValid:boolean;
 requiredChecks:{commandId:string;commandVersion:1;arguments:Record<string,string>;registryHash:string;argvHash:string;minPassedTests:number|null}[];
 limits:ReviewLimits;budget:{totalMicrousd:number;reviewerAllocationMicrousd:number;spentMicrousd:number;reservedReviewerMicrousd:number};deadlineMs:number;
}
export interface ReviewArtifactV1 {id:string;kind:'brief'|'source_before'|'source_after'|'diff'|'stdout'|'stderr';body:string}
export interface BuiltReviewArtifactV1 extends ReviewArtifactV1 {sha256:string;byteLength:number}
export interface ReviewFileV1 {path:string;beforeArtifactId:string|null;afterArtifactId:string|null}
export interface ReviewCheckV1 {commandId:string;registryHash:string;argvHash:string;exitCode:number|null;outcome:'passed'|'failed'|'skipped';passedTestCount:number|null;durationMs:number;stdoutArtifactId:string;stderrArtifactId:string}
export interface ReviewSnapshotInputV1 {schema:'atlas.code_review_snapshot.v1';binding:ReviewBindingV1;assignment:ReviewAssignmentV1;candidateVersion:1|2;briefArtifactId:string;files:ReviewFileV1[];diffArtifactId:string;diffBytes:number;checks:ReviewCheckV1[];artifacts:ReviewArtifactV1[]}
export interface ReviewSnapshotV1 extends Omit<ReviewSnapshotInputV1,'artifacts'> {artifacts:BuiltReviewArtifactV1[];snapshotHash:string}
export interface ReviewFindingV1 {id:string;severity:'critical'|'important'|'minor';artifactId:string;path:string|null;line:number|null;trigger:string;impact:string;evidence:string;suggestedCorrection:string}
export interface ReviewModelResultV1 {schema:'atlas.code_review_result.v1';snapshotHash:string;phase:'preliminary'|'final';decision:'passed'|'changes_requested'|'inconclusive';findings:ReviewFindingV1[];gaps:string[];pendingQuestionIds:string[]}
export interface BoundReviewResultV1 extends ReviewModelResultV1 {assignment:ReviewAssignmentV1;resultHash:string}
export interface ReviewEligibilityDecision {eligible:boolean;productionAuthority:false;reasons:string[];minorFindingIds:string[]}
export interface AgentMessageBodyV1 {schema:'atlas.code_review_message.v1';id:string;snapshotHash:string;kind:'question'|'answer'|'finding_reference'|'correction_request'|'blocker';body:string;replyTo:string|null;artifactIds:string[]}
export interface AgentMessageContext {expected:ExpectedReviewContext;snapshot:ReviewSnapshotV1;senderRole:ReviewRole;recipientRole:ReviewRole;phase:'initial'|'discussion'|'closed';firstAssessment:BoundReviewResultV1|null;senderActorId:string;senderSessionId:string}
export interface AgentMessageV1 extends AgentMessageBodyV1 {sequence:number;workId:string;projectId:string;from:{role:ReviewRole;actorId:string;sessionId:string};to:{role:ReviewRole;actorId:string;sessionId:string};assignmentHash:string;observedAt:string;messageHash:string}
export interface AgentMessageLedgerV1 {workId:string;projectId:string;entries:readonly AgentMessageV1[]}
