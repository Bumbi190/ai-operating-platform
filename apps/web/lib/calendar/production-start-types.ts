export type StoryJobReceipt={requestId:string;runId:string;status:'pending'|'running'|'succeeded'|'failed'|'cancelled'|'needs_review';replayed:boolean};
export type StoryJobReview={requestId:string;reviewedHash:string;expiresAt:string;provider:'anthropic';model:string;maximumSek:string;month:string;theme:string;receipt:StoryJobReceipt|null};
