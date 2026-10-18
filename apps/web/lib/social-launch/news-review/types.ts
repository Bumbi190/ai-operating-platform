import type {PilotVoiceReceipt} from '@/lib/media/pilot-voice-receipt'
export type PrepareNewsReviewInput={projectId:string;scriptId:string;videoAssetId:string;idempotencyKey:string}
export type AssetIdentity={id:string;sha256:string;byteSize:number}
export type WordTiming={word:string;startMs:number;endMs:number}
export type UsageEvidence={documentUrl:string;documentSha256:string;documentText:string;scope:'public_social_editorial';reviewedBy:string;reviewedAt:string}
export type RenderReceipt={
 kind:'the-prompt-review-render-v1';projectId:string;scriptId:string;scriptSha256:string;hookSha256:string;captionSha256:string;language:'en'
 source:{newsItemId:string;url:string;key:string;publishedAt:string}
 video:{sha256:string;byteSize:number};images:[AssetIdentity,AssetIdentity,AssetIdentity];audio:AssetIdentity
 voiceReceipt:PilotVoiceReceipt;words:WordTiming[];transcript:string;narrationDurationMs:number
 creativeVersion:'the-prompt-illustrated-smooth-v1';compositionId:'ThePromptIllustratedNews';sourceSha:string
 profile:{width:720;height:1280;fps:30;frames:number;durationMs:number;videoCodec:'h264';audioCodec:'aac'}
 qa:{reportSha256:string;reportText:string;reviewedBy:string;reviewedAt:string}
 usage:[UsageEvidence,UsageEvidence,UsageEvidence];assetProvenanceIds:string[];costEventIds:string[]
}
export type NewsEvidenceSnapshot={video:AssetIdentity;receipt:RenderReceipt;receiptSha256:string;provenanceId:string;planRevisionId:string;destinations:{channel:'facebook'|'instagram'|'youtube';bindingId:string|null;accountId:string|null}[]}
export type NewsReviewView={projectId:string;postId:string|null;revisionId:string|null;evidenceSha256:string|null;review_packet_ready:boolean;blockers:string[];publicationBlockers:string[];canPublish:false;dispatchEnabled:false}
export type NewsReviewCode='NOT_FOUND'|'INVALID_BODY'|'MISSING_SOURCE'|'SOURCE_EXPIRED'|'MISSING_RENDER_EVIDENCE'|'MISSING_USAGE_EVIDENCE'|'MISSING_COST_PROVENANCE'|'MEDIA_CHANGED'|'PLAN_REQUIRED'|'STOPPED'|'UNAVAILABLE'|'REVISION_CONFLICT'
export class NewsReviewError extends Error{constructor(public readonly code:NewsReviewCode){super(code);this.name='NewsReviewError'}}
