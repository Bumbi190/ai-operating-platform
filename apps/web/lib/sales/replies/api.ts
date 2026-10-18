import 'server-only'
import {resolveProjectAccess,type ProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {salesEnabled} from '../feature'
import {scoped,type SalesDb} from '../store'
import {fields,salesId} from '../validate'
import {SalesError} from '../types'
import {salesHeaders,readBody,failure} from '../http'
import {prepareReply,readReplyJob,readReplyDrafts,editReplyDraft,reviewReplyDraft,cancelReplyJob} from './store'
export function createReplyApi(deps:{access:()=>Promise<ProjectAccess>;db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  const p=await deps.access();if(!p.ok)return p.response
  if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)throw new SalesError('ORIGIN_REQUIRED',403)
  if(request.method==='GET'){
   const q=new URL(request.url).searchParams
   if([...q.keys()].some(k=>!['projectId','jobId'].includes(k)||q.getAll(k).length!==1)||q.getAll('projectId').length!==1)throw new SalesError('INVALID_BODY')
   const projectId=salesId(q.get('projectId'));scoped(p,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
   return Response.json(q.has('jobId')?await readReplyJob(deps.db(),p,{projectId,jobId:q.get('jobId')}):await readReplyDrafts(deps.db(),p,{projectId}),{headers:salesHeaders})
  }
  const v=await readBody(request);fields(v,['operation','projectId','conversationId','messageId','messageVersion','contactId','contactVersion','offerRevisionId','idempotencyKey','replyMode','jobId','revisionId','expectedHash','subject','body','questions','decision'])
  const projectId=salesId(v.projectId);scoped(p,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
  const {operation,...input}=v;let result:unknown
  if(operation==='prepare')result=await prepareReply(deps.db(),p,input)
  else if(operation==='edit')result=await editReplyDraft(deps.db(),p,input)
  else if(operation==='review')result=await reviewReplyDraft(deps.db(),p,input)
  else if(operation==='cancel')result=await cancelReplyJob(deps.db(),p,input)
  else throw new SalesError('INVALID_BODY')
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const replyApi=createReplyApi({access:resolveProjectAccess,db:createAdminClient,enabled:salesEnabled})
