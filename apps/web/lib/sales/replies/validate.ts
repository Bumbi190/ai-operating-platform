import {fields,salesId,text,ids} from '../validate'
import {integer} from '../inbox/validate'
import {SalesError} from '../types'
import type {PrepareReplyInput,ReplyRef,ReplyDraft} from './types'
export function parsePrepareReply(v:unknown):PrepareReplyInput{fields(v,['projectId','conversationId','messageId','messageVersion','contactId','contactVersion','offerRevisionId','idempotencyKey']);return {projectId:salesId(v.projectId),conversationId:salesId(v.conversationId),messageId:salesId(v.messageId),messageVersion:integer(v.messageVersion,1),contactId:salesId(v.contactId),contactVersion:integer(v.contactVersion,1),offerRevisionId:salesId(v.offerRevisionId),idempotencyKey:salesId(v.idempotencyKey)}}
export function parseReplyRef(v:unknown):ReplyRef{fields(v,['projectId','jobId','workerId','claimId','generation']);return {projectId:salesId(v.projectId),jobId:salesId(v.jobId),workerId:salesId(v.workerId),claimId:salesId(v.claimId),generation:integer(v.generation,1)}}
export function parseReplyDraft(v:unknown,messageId?:string):ReplyDraft{
 fields(v,['subject','body','evidenceIds','questions']);const subject=text(v.subject,90),body=text(v.body,2000),evidenceIds=ids(v.evidenceIds,1)
 if(/[\r\n]/.test(subject)||/<\/?[a-z][^>]*>/i.test(body)||/\{\{?\s*\w+\s*\}\}?/.test(body)||evidenceIds.length!==1||(messageId&&evidenceIds[0]!==messageId)||!Array.isArray(v.questions)||v.questions.length>10)throw new SalesError('INVALID_BODY')
 return {subject,body,evidenceIds,questions:v.questions.map(q=>text(q,500))}
}
export function parseReplyReview(v:unknown){fields(v,['projectId','revisionId','expectedHash','decision']);if(typeof v.expectedHash!=='string'||!/^[a-f0-9]{64}$/.test(v.expectedHash)||!['approved','rejected'].includes(String(v.decision)))throw new SalesError('INVALID_BODY');return {projectId:salesId(v.projectId),revisionId:salesId(v.revisionId),expectedHash:v.expectedHash,decision:v.decision as 'approved'|'rejected'}}
export function parseReplyEdit(v:unknown){fields(v,['projectId','revisionId','expectedHash','subject','body','questions']);const {projectId,revisionId,expectedHash}=parseReplyReview({projectId:v.projectId,revisionId:v.revisionId,expectedHash:v.expectedHash,decision:'rejected'});const subject=text(v.subject,90),body=text(v.body,2000);if(/[\r\n]/.test(subject)||/<\/?[a-z][^>]*>/i.test(body)||/\{\{?\s*\w+\s*\}\}?/.test(body)||!Array.isArray(v.questions)||v.questions.length>10)throw new SalesError('INVALID_BODY');return {projectId,revisionId,expectedHash,subject,body,questions:v.questions.map(q=>text(q,500))}}
export function replyJobRef(v:unknown){fields(v,['projectId','jobId']);return {projectId:salesId(v.projectId),jobId:salesId(v.jobId)}}
