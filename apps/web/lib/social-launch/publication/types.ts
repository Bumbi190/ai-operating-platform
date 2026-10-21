import type {SocialLaunchPrincipal} from '../types'
import type {SocialContentPost} from '../content/types'
export type PublicationState='requested'|'creating'|'processing'|'publishing'|'published'|'failed'|'uncertain'
export type PublicationRecord={id:string;projectId:string;postId:string;revisionId:string;sha256:string;decisionId:string;bindingId:string;channel:'facebook'|'instagram';accountId:string;accountLabel:string|null;state:PublicationState;version:number;containerId:string|null;providerId:string|null;permalink:string|null;failureCode:string|null;confirmation:'provider_id'|'container_status'|null;requestedAt:string;updatedAt:string;reconciledAt?:string|null;authoritySource?:'manual'|'scheduled';jobId?:string|null}
export type PublicationRequest={projectId:string;postId:string;revisionId:string;sha256:string;decisionId:string;bindingId:string;idempotencyKey:string;confirmed:true}
export type PublicationAction='claim_create'|'container_ready'|'claim_publish'|'complete'|'fail'|'uncertain'|'confirm_published'
export type PublicationStep={projectId:string;postId:string;publicationId:string;expectedVersion:number;action:PublicationAction;capabilityHash?:string;containerId?:string;providerId?:string;permalink?:string|null;failureCode?:'provider_denied'|'provider_unavailable'|'invalid_response'|'receipt_unavailable'}
export type PublicationView={projectId:string;postId:string;publication:PublicationRecord|null;canRequest:boolean;blockers:string[];target:{channel:string;accountLabel:string|null}|null}
export type PublicationPrincipal=SocialLaunchPrincipal
export class PublicationError extends Error{
 constructor(public code:'NOT_FOUND'|'INVALID_BODY'|'REVIEW_REQUIRED'|'UNSUPPORTED'|'STOPPED'|'CONFLICT'|'UNAVAILABLE'){super(code)}
 get status(){return this.code==='NOT_FOUND'?404:this.code==='INVALID_BODY'?400:this.code==='STOPPED'?423:this.code==='UNAVAILABLE'?503:409}
}
export type PublicationPost=SocialContentPost
