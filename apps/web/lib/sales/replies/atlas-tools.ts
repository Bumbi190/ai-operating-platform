import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import {SalesError,type SalesPrincipal} from '../types'
import {readSalesWorkspace,salesRpc,type SalesDb} from '../store'
import type {SendJobSummary} from '../sending/types'
import {prepareReply,readReplyJob,readReplyDrafts} from './store'
const projectId={type:'string' as const}
export const REPLY_TOOLS:Anthropic.Tool[]=[
 {name:'prepare_sales_reply',description:'Queue one Swedish reply draft for an explicitly selected complete incoming message, exact confirmed contact/branch and immutable offer. Previously contacted branches are allowed. Use explicit replyMode=general for an ordinary noncommercial reply with no contactId/contactVersion/offerRevisionId; no offer or pilot promises are allowed. Server derives recipient and trusted sender. Does not select text, link contacts, change the recipient, approve or send. Requires the owner request and existing saved evidence. Reuse one UUID idempotencyKey when retrying the same request.',input_schema:{type:'object',additionalProperties:false,properties:{projectId,messageId:{type:'string'},messageVersion:{type:'integer',minimum:1},replyMode:{type:'string',enum:['general','commercial']},contactId:{type:'string'},contactVersion:{type:'integer',minimum:1},offerRevisionId:{type:'string'},idempotencyKey:{type:'string'}},required:['projectId','messageId','messageVersion','idempotencyKey']}},
 {name:'get_sales_reply_job',description:'Read actual persisted reply preparation status, editorial approval, source freshness, the current reply draft and its exact saved sendStatus. sendStatus.known=true with job=null means no send is recorded for that current revision; known=false or a read error does not prove absence. Preparation job ID, draft revision ID and send job ID are different. Never pass a reply preparation ID to get_sales_send_status. A queued job is waiting for a specialist. Newer incoming mail from the same address requires human review and is not proof of a shared thread. Does not start, approve, edit or send.',input_schema:{type:'object',additionalProperties:false,properties:{projectId,jobId:{type:'string'}},required:['projectId','jobId']}}
]
// The parent handler validates the trusted conversation/project before entering.
export async function handleReplyTool(name:string,input:Record<string,unknown>,p:SalesPrincipal,conversationId:string,db:SalesDb){
 const job=name==='prepare_sales_reply'?await prepareReply(db,p,{...input,conversationId}):await readReplyJob(db,p,input)
 const workspaceUrl=(await readSalesWorkspace(db,p,String(input.projectId))).workspaceUrl
 if(name==='prepare_sales_reply')return {...job,sendingEnabled:false,workspaceUrl}
 const workspace=await readReplyDrafts(db,p,{projectId:input.projectId})
 const current=workspace.drafts.filter(d=>d.current&&d.jobId===job.id&&d.projectId===input.projectId)
 if(current.length>1)throw new SalesError('UNAVAILABLE',503)
 const draft=current[0]??null
 let sendStatus:{known:boolean;job:SendJobSummary|null}={known:false,job:null}
 if(draft){
  const preview=await salesRpc<{revisionId:string;revisionHash:string;job:SendJobSummary|null}>(db,'sales_send_preview',{p_principal:p,p_input:{projectId:input.projectId,revisionId:draft.id}})
  if(preview.revisionId!==draft.id||preview.revisionHash!==draft.sha256||!Object.hasOwn(preview,'job'))throw new SalesError('UNAVAILABLE',503)
  if(preview.job&&(preview.job.revisionId!==draft.id||preview.job.revisionHash!==draft.sha256))throw new SalesError('UNAVAILABLE',503)
  sendStatus={known:true,job:preview.job}
 }
 return {...job,draft,sendStatus,sendingEnabled:false,workspaceUrl}
}
