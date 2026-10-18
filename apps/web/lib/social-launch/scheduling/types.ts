import type {SocialContentRevision} from '../content/types'
import type {PublicationRecord} from '../publication/types'
export type ScheduleItem={postId:string;revisionId:string;sha256:string;decisionId:string;planRevisionId:string;bindingId:string;accountId:string;channel:'facebook'|'instagram';asset:{id:string;sha256:string};localMinute:string;scheduledAt:string;expiresAt:string;occasionId:string;kind:'ordinary'|'month_release';releaseCondition:{releaseMonth:string;catalogSha256:string}|null}
export type ScheduleManifest={projectId:string;items:ScheduleItem[]}
export type QueueState='queued'|'claimed'|'waiting'|'published'|'failed'|'uncertain'|'blocked'|'cancelled'|'missed'
export type ScheduleJob={id:string;batchId:string;postId:string;channel:'facebook'|'instagram';state:QueueState;scheduledAt:string;expiresAt:string;publicationId:string|null;reason:string|null;version:number}
export type ScheduleBatchView={projectId:string;batchId:string;revisionId:string;sha256:string;status:'proposal'|'approved'|'revoked';manifest:ScheduleManifest;approval:{id:string;approvedBy:string;approvedAt:string}|null;jobs:ScheduleJob[];version:number}
export type ApprovedScheduleSnapshot={projectId:string;manifestSha256:string;approvalId:string;item:ScheduleItem;revision:SocialContentRevision;publication:PublicationRecord|null}
export type ScheduleClaim={jobId:string;claimId:string;version:number;leaseExpiresAt:string;snapshot:ApprovedScheduleSnapshot}
export type MonthlyRule={dayOfMonth:1;localTime:'20:30';timeZone:'Europe/Stockholm';channels:['facebook','instagram'];enabled:boolean}
export class ScheduleError extends Error{
 constructor(public code:'INVALID_BODY'|'NOT_FOUND'|'CONFLICT'|'REVIEW_REQUIRED'|'STOPPED'|'UNAVAILABLE'|'NOT_DUE'|'EXPIRED'|'RELEASE_REQUIRED'|'DISABLED'){super(code)}
 get status(){return this.code==='NOT_FOUND'?404:this.code==='INVALID_BODY'?400:this.code==='STOPPED'?423:this.code==='UNAVAILABLE'?503:409}
}
