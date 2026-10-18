import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type {SalesPrincipal} from '../types'
import {readSalesWorkspace,type SalesDb} from '../store'
import {prepareReply,readReplyJob} from './store'
const projectId={type:'string' as const}
export const REPLY_TOOLS:Anthropic.Tool[]=[
 {name:'prepare_sales_reply',description:'Queue one Swedish reply draft for an explicitly selected complete incoming message, exact confirmed contact/branch and immutable offer. Previously contacted branches are allowed. Use explicit replyMode=general for an ordinary noncommercial reply with no contactId/contactVersion/offerRevisionId; no offer or pilot promises are allowed. Server derives recipient and trusted sender. Does not select text, link contacts, change the recipient, approve or send. Requires the owner request and existing saved evidence. Reuse one UUID idempotencyKey when retrying the same request.',input_schema:{type:'object',additionalProperties:false,properties:{projectId,messageId:{type:'string'},messageVersion:{type:'integer',minimum:1},replyMode:{type:'string',enum:['general','commercial']},contactId:{type:'string'},contactVersion:{type:'integer',minimum:1},offerRevisionId:{type:'string'},idempotencyKey:{type:'string'}},required:['projectId','messageId','messageVersion','idempotencyKey']}},
 {name:'get_sales_reply_job',description:'Read actual persisted reply preparation status and source freshness. A queued job is waiting for a specialist. Newer incoming mail from the same address requires human review and is not proof of a shared thread. Does not start, approve or send.',input_schema:{type:'object',additionalProperties:false,properties:{projectId,jobId:{type:'string'}},required:['projectId','jobId']}}
]
// The parent handler validates the trusted conversation/project before entering.
export async function handleReplyTool(name:string,input:Record<string,unknown>,p:SalesPrincipal,conversationId:string,db:SalesDb){
 const job=name==='prepare_sales_reply'?await prepareReply(db,p,{...input,conversationId}):await readReplyJob(db,p,input)
 return {...job,sendingEnabled:false,workspaceUrl:(await readSalesWorkspace(db,p,String(input.projectId))).workspaceUrl}
}
