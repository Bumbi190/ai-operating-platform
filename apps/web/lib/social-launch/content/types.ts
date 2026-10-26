import type {SocialLaunchChannelId,SocialLaunchFormat,SocialLaunchPrincipal} from '../types'
export type SocialContentInput={channel:SocialLaunchChannelId;format:SocialLaunchFormat;title:string;text:string;linkUrl:string|null;mediaIds:string[];mediaBrief:string;scheduledAt:string|null}
export type SocialContentAsset={id:string;kind:'image'|'video';sha256:string;mimeType:string;width:number|null;height:number|null}
export type SocialContentRevision={id:string;sequence:number;sha256:string;planRevisionId:string;draft:SocialContentInput;media:SocialContentAsset[];binding:{id:string;accountId:string;label:string|null}|null;createdAt:string}
export type SocialRepeatConflict={postId:string|null;publicationId:string|null;at:string|null;reason:'duplicate_content'|'similar_recent_content'|'repeat_history_unavailable'|'short_content_review'}
export type SocialContentPost={id:string;revision:SocialContentRevision;decision:{id:string;decision:'approve'|'reject';revisionId:string;sha256:string;decidedAt:string}|null;status:'proposal'|'approved'|'rejected'|'needs_review';requirements:string[];repeatConflict?:SocialRepeatConflict}
export type SocialContentView={project:{id:string;name:string;slug:string};posts:SocialContentPost[];assets:SocialContentAsset[];hasMoreAssets:boolean;plannedChannels:import('../types').SocialLaunchChoice[];currentPlanRevisionId:string|null;planApproved:boolean;workspaceUrl:string;dispatchEnabled:false;publicationReady:false}
export type SocialContentProposal={projectId:string;conversationId?:string|null;postId:string;expectedRevisionId:string|null;planRevisionId:string;idempotencyKey:string;draft:SocialContentInput}
export type SocialContentDecision={projectId:string;postId:string;revisionId:string;sha256:string;decision:'approve'|'reject';idempotencyKey:string}
export type SocialContentPrincipal=SocialLaunchPrincipal
export class SocialContentError extends Error{
 constructor(public code:'NOT_FOUND'|'INVALID_BODY'|'REVISION_CONFLICT'|'REVIEW_REQUIRED'|'MEDIA_REQUIRED'|'STOPPED'|'UNAVAILABLE'|'LIMIT_REACHED'){super(code)}
 get status(){return this.code==='NOT_FOUND'?404:this.code==='INVALID_BODY'?400:this.code==='UNAVAILABLE'?503:this.code==='STOPPED'?423:409}
}
