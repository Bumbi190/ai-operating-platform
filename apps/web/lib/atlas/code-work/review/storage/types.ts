import type {CodeWorkAdmissionV1} from '../../types'
import type {AgentMessageBodyV1,AgentMessageLedgerV1,BoundReviewResultV1,ExpectedReviewContext,ReviewActor,ReviewRole,ReviewSnapshotInputV1,ReviewSnapshotV1} from '../types'
export const REVIEW_STORAGE_MAX_BYTES=1048576
export interface ReviewRoleCredential {token:string}
export interface StorageActor extends ReviewActor {role:ReviewRole}
export interface ParentReviewProof {workId:string;claimId:string;fence:number;brokerId:string;brokerHostId:string;brokerTokenHash:string}
export interface ReviewStorageConfig {
 admission:CodeWorkAdmissionV1;admissionHash:string;parent:Omit<ParentReviewProof,'brokerTokenHash'>;
 createdAtMs:number;authorizationExpiresAtMs:number;targetHeadSha:string;policyHash:string;
 requiredChecks:ExpectedReviewContext['requiredChecks'];limits:ExpectedReviewContext['limits'];
 budget:{totalMicrousd:number;reviewerAllocationMicrousd:number};deadlineMs:number;
 coordinator:ReviewActor;worker:ReviewActor;
}
export interface StoredReviewCandidate {version:1|2;snapshot:ReviewSnapshotV1;preliminary:BoundReviewResultV1|null;final:BoundReviewResultV1|null}
export type ReviewStorageCommand=
 |{id:string;kind:'freeze';snapshotInput:ReviewSnapshotInputV1}
 |{id:string;kind:'report';candidateVersion:1|2;result:import('../types').ReviewModelResultV1}
 |{id:string;kind:'message';candidateVersion:1|2;recipientRole:ReviewRole;body:AgentMessageBodyV1}
export interface CommandReceipt {id:string;kind:ReviewStorageCommand['kind'];role:ReviewRole;actorId:string;sessionId:string;candidateVersion:1|2;commandHash:string;jobVersion:number;observedAtMs:number;payloadRef:string}
export interface StoredReviewJobV1 {workId:string;projectId:string;version:number;config:ReviewStorageConfig;candidates:StoredReviewCandidate[];messages:AgentMessageLedgerV1;commands:CommandReceipt[]}
export interface CommandResult {outcome:'appended'|'replayed';jobVersion:number;commandId:string;productionAuthority:false}
export interface PrepareResult {expectedVersion:number;commandId:string;commandHash:string;next:StoredReviewJobV1;outcome:'appended'|'replayed'}
export type StorageStatus='ok'|'replayed'|'conflict'|'not_live'|'not_permitted'|'unavailable'
export interface ReviewCredentialRow extends StorageActor {tokenHash:string;candidateVersion:0|1|2}

export interface ReviewRoleView {workId:string;projectId:string;role:import('../types').ReviewRole;candidate:StoredReviewCandidate|null;messages:readonly import('../types').AgentMessageV1[]}
export interface ReviewOperatorView {workId:string;projectId:string;jobVersion:number;candidates:readonly StoredReviewCandidate[];messages:readonly import('../types').AgentMessageV1[]}
export type ReviewServiceCommand=Exclude<ReviewStorageCommand,{kind:'freeze'}>|{id:string;kind:'freeze';snapshotInput:Omit<ReviewSnapshotInputV1,'binding'|'assignment'>}
export interface ReviewApplyInput {workId:string;role:ReviewRole;sessionId:string;tokenHash:string;expectedVersion:number;command:ReviewStorageCommand;commandHash:string;next:StoredReviewJobV1;newReviewer:ReviewCredentialRow|null}
export interface ReviewStorageStore {
 read(workId:string):Promise<StoredReviewJobV1|null>
 initialize(proof:ParentReviewProof,config:ReviewStorageConfig,roles:ReviewCredentialRow[]|null):Promise<StoredReviewJobV1>
 authenticate(workId:string,role:ReviewRole,sessionId:string,tokenHash:string):Promise<StorageActor & {candidateVersion:0|1|2}>
 observe(workId:string):Promise<{job:StoredReviewJobV1;nowMs:number;parentLive:boolean}>
 apply(input:ReviewApplyInput):Promise<CommandResult>
 readForRole(workId:string,role:ReviewRole,sessionId:string,tokenHash:string):Promise<ReviewRoleView>
 rotate(workId:string,proof:ParentReviewProof,role:ReviewRole,sessionId:string,newHash:string):Promise<void>
}
