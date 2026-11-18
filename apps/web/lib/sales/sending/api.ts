import 'server-only'
import {resolveProjectAccess,type ProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {salesEnabled} from '../feature'
import {scoped,salesRpc,type SalesDb} from '../store'
import {fields,salesId} from '../validate'
import {SalesError} from '../types'
import {salesHeaders,readBody,failure} from '../http'
import {confirmReplySend,readReplySend,cancelReplySend} from './store'
export function createSendApi(deps:{access:()=>Promise<ProjectAccess>;db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  const principal=await deps.access();if(!principal.ok)return principal.response
  if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)throw new SalesError('ORIGIN_REQUIRED',403)
  if(request.method==='GET'){
   const q=new URL(request.url).searchParams
   if([...q.keys()].some(k=>!['projectId','revisionId','sendJobId'].includes(k)||q.getAll(k).length!==1)||q.getAll('projectId').length!==1||Number(q.has('revisionId'))+Number(q.has('sendJobId'))!==1)throw new SalesError('INVALID_BODY')
   const projectId=salesId(q.get('projectId'));scoped(principal,projectId)
   if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
   const result=q.has('revisionId')?await salesRpc(deps.db(),'sales_send_preview',{p_principal:principal,p_input:{projectId,revisionId:salesId(q.get('revisionId'))}}):await readReplySend(deps.db(),principal,{projectId,sendJobId:q.get('sendJobId')})
   return Response.json(result,{headers:salesHeaders})
  }
  const v=await readBody(request);fields(v,['operation','projectId','revisionId','expectedRevisionHash','expectedMailboxGeneration','idempotencyKey','sendJobId'])
  const projectId=salesId(v.projectId);scoped(principal,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
  const {operation,...input}=v
  const result=operation==='confirm'?await confirmReplySend(deps.db(),principal,input):operation==='cancel'?await cancelReplySend(deps.db(),principal,input):(()=>{throw new SalesError('INVALID_BODY')})()
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const sendApi=createSendApi({access:resolveProjectAccess,db:createAdminClient,enabled:salesEnabled})
