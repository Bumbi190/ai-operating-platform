import 'server-only'
import {resolveProjectAccess,type ProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {salesRpc,scoped,type SalesDb} from '../store'
import {SalesError} from '../types'
import {fields,salesId} from '../validate'
import {salesHeaders,failure,readBody} from '../http'
import {salesEnabled} from '../feature'
import {configureInbox,readInbox,readInboxMessage} from './store'
import {integer} from './validate'
export function createInboxApi(deps:{access:()=>Promise<ProjectAccess>;db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  const p=await deps.access();if(!p.ok)return p.response
  if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)throw new SalesError('ORIGIN_REQUIRED',403)
  if(request.method==='GET'){
   const q=new URL(request.url).searchParams
   if([...q.keys()].some(k=>!['projectId','mailboxId','messageId','cursor'].includes(k)||q.getAll(k).length!==1)||q.getAll('projectId').length!==1||Number(q.has('mailboxId'))+Number(q.has('messageId'))!==1||(q.has('messageId')&&q.has('cursor')))throw new SalesError('INVALID_BODY')
   const projectId=salesId(q.get('projectId'));scoped(p,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
   const result=q.has('messageId')?await readInboxMessage(deps.db(),p,{projectId,messageId:q.get('messageId')}):await readInbox(deps.db(),p,{projectId,mailboxId:q.get('mailboxId'),cursor:q.get('cursor')})
   return Response.json(result,{headers:salesHeaders})
  }
  const v=await readBody(request);fields(v,['operation','projectId','mailboxId','expectedVersion','folder','since','selectedContactIds','state','messageId','contactId']);const projectId=salesId(v.projectId);scoped(p,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
  const {operation,...input}=v;const db=deps.db();let result:unknown
  if(operation==='configure')result=await configureInbox(db,p,input)
  else if(operation==='set_state'){
   fields(input,['projectId','mailboxId','expectedVersion','state']);if(!['enabled','paused','revoked'].includes(String(input.state)))throw new SalesError('INVALID_BODY')
   result=await salesRpc(db,'sales_inbox_set_inbox_state',{p_principal:p,p_input:{projectId,mailboxId:salesId(input.mailboxId),expectedVersion:integer(input.expectedVersion,1),state:input.state}})
  }else if(operation==='select_text'){
   fields(input,['projectId','messageId','expectedVersion']);result=await salesRpc(db,'sales_inbox_select_message_text',{p_principal:p,p_input:{projectId,messageId:salesId(input.messageId),expectedVersion:integer(input.expectedVersion,1)}})
  }else if(operation==='link_message'){
   fields(input,['projectId','messageId','expectedVersion','contactId']);result=await salesRpc(db,'sales_inbox_link_message',{p_principal:p,p_input:{projectId,messageId:salesId(input.messageId),expectedVersion:integer(input.expectedVersion,1),contactId:salesId(input.contactId)}})
  }else throw new SalesError('INVALID_BODY')
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const inboxApi=createInboxApi({access:resolveProjectAccess,db:createAdminClient,enabled:salesEnabled})
