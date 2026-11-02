export type CampaignDraft={title:string;text:string;imagePrompt:string;localMinute:string;scheduledAt:string}
export type CampaignInput={projectId:string;campaignId:string;planRevisionId:string;profileRevisionId:string;idempotencyKey:string;items:CampaignDraft[]}
export type CampaignPrincipal={userId:string;allowedProjectIds:string[]}
export type CampaignItemState='queued'|'generating'|'asset_admitted'|'review_ready'|'blocked'|'uncertain'|'cancelled'
export type CampaignItem={id:string;runId:string;postId:string;state:CampaignItemState;unitCeilingSek:number;draft:CampaignDraft;assetId:string|null;revisionId:string|null;reason:string|null}
export type CampaignView={id:string;projectId:string;conversationId:string;status:'queued'|'working'|'review_ready'|'partial'|'blocked'|'uncertain'|'cancelled';items:CampaignItem[];workspaceUrl:string;contentUrl:string;maxCostSek:number;publicationAuthority:false}
export type CampaignWriter={projectId:string;campaignId:string;itemId:string;runId:string;claimId:string}
export class CampaignError extends Error{
 constructor(public code:'INVALID_BODY'|'NOT_FOUND'|'CONFLICT'|'REVIEW_REQUIRED'|'PROFILE_REQUIRED'|'STOPPED'|'DISABLED'|'COST_LIMIT'|'FENCED'|'CANCELLED'|'UNCERTAIN'|'UNAVAILABLE'){super(code)}
}
