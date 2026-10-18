import type {SalesContact,SalesOfferRevision} from '../types'
import type {InboxHeader} from '../inbox/types'
export type PrepareReplyInput={projectId:string;conversationId:string;messageId:string;messageVersion:number;contactId:string;contactVersion:number;offerRevisionId:string;idempotencyKey:string}
export type ReplyRef={projectId:string;jobId:string;workerId:string;claimId:string;generation:number}
export type ReplyDraft={subject:string;body:string;evidenceIds:string[];questions:string[]}
export type ReplySnapshot={mailboxId:string;mailboxGeneration:number;inboxConfigVersion:number;messageId:string;messageVersion:number;canonicalMessageId:string;canonicalVersion:number;contentSha256:string;header:InboxHeader;text:string;contact:SalesContact;offer:SalesOfferRevision}
export type ReplyJobSummary={id:string;projectId:string;messageId:string;status:'queued'|'running'|'needs_input'|'awaiting_review'|'failed'|'reconciling'|'cancelled';createdAt:string;detail:string|null;attempts:number;sourceCurrent:boolean;newerIncoming:boolean;sendingEnabled:false;source:{subject:string;companyName:string;branchName:string;senderEmail:string;toEmail:string;offerText:string}}
export type ReplyDraftRevision=ReplyDraft&{id:string;projectId:string;jobId:string;sha256:string;current:boolean;status:string;runId:string|null;approvalId:string|null;createdAt:string}
export type ReplyWorkspace={jobs:ReplyJobSummary[];drafts:ReplyDraftRevision[];sendingEnabled:false}
