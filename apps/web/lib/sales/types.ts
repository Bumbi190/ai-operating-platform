export class SalesError extends Error {
  constructor(public code:string,public status=400){super(code)}
}
export type SalesPrincipal={userId:string;allowedProjectIds:string[]}
export type PrepareSalesInput={projectId:string;conversationId:string;contactIds:string[];offerRevisionId:string;idempotencyKey:string}
export type SalesDraft={contactId:string;contactVersion:number;offerRevisionId:string;senderEmail:string;toEmail:string;subject:string;body:string;evidenceIds:string[];questions:string[]}
export type SalesJobRef={projectId:string;jobId:string}
export type SalesWorkerRef=SalesJobRef&{workerId:string;claimId:string;generation:number}
export type SalesContact={id:string;projectId:string;companyName:string;branchName:string;email:string;websiteUrl:string|null;version:number;history:'not_contacted'|'contacted'|'unknown';historySource:string;confirmed:boolean;excluded:boolean;suppressed:boolean}
export type SalesOfferRevision={id:string;projectId:string;senderEmail:string;offerText:string;productFacts:string[];freeMonths:2|6|12;confirmed:boolean;createdAt:string}
export type SalesJobStatus='queued'|'running'|'needs_input'|'awaiting_review'|'failed'|'reconciling'|'cancelled'
export type SalesJobSummary={id:string;projectId:string;status:SalesJobStatus;createdAt:string;attempts:number;detail:string|null}
export type SalesDraftRevision=SalesDraft&{id:string;projectId:string;jobId:string;sha256:string;approvalId:string|null;runId:string|null;status:string;current:boolean;createdAt:string}
export type SalesWorkspace={projectId:string;state:'ok'|'unavailable';workerState:'connected'|'not_connected';contacts:SalesContact[];offers:SalesOfferRevision[];jobs:SalesJobSummary[];drafts:SalesDraftRevision[];workspaceUrl:string;sendingEnabled:false}
