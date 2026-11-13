import 'server-only'
import {scoped,salesRpc,type SalesDb} from '../store'
import type {SalesPrincipal} from '../types'
import {fields,salesId} from '../validate'
import {parsePrepareReply,parseReplyEdit,parseReplyReview,replyJobRef} from './validate'
import type {ReplyJobSummary,ReplyWorkspace,ReplyDraftRevision} from './types'
export async function prepareReply(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<ReplyJobSummary>{const input=parsePrepareReply(v);scoped(p,input.projectId);return salesRpc(db,'sales_reply_prepare',{p_principal:p,p_input:input})}
export async function readReplyJob(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<ReplyJobSummary>{const input=replyJobRef(v);scoped(p,input.projectId);return salesRpc(db,'sales_reply_read_job',{p_principal:p,p_input:input})}
export async function readReplyDrafts(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<ReplyWorkspace>{fields(v,['projectId']);const input={projectId:salesId(v.projectId)};scoped(p,input.projectId);return salesRpc(db,'sales_reply_read_drafts',{p_principal:p,p_input:input})}
export async function editReplyDraft(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<ReplyDraftRevision>{const input=parseReplyEdit(v);scoped(p,input.projectId);return salesRpc(db,'sales_reply_edit_draft',{p_principal:p,p_input:input})}
export async function reviewReplyDraft(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<ReplyDraftRevision>{const input=parseReplyReview(v);scoped(p,input.projectId);return salesRpc(db,'sales_reply_review_draft',{p_principal:p,p_input:input})}
export async function cancelReplyJob(db:SalesDb,p:SalesPrincipal,v:unknown):Promise<ReplyJobSummary>{const input=replyJobRef(v);scoped(p,input.projectId);return salesRpc(db,'sales_reply_cancel_job',{p_principal:p,p_input:input})}
