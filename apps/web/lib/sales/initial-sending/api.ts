import 'server-only'
import {resolveProjectAccess,type ProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {salesRpc,scoped,type SalesDb} from '../store'
import {SalesError} from '../types'
import {fields,salesId} from '../validate'
import {salesHeaders,readBody,failure} from '../http'
import {parseSendCancel} from '../sending/validate'
import {parseConfirmInitialSend} from './validate'
import {initialSendEnabled} from './feature'
export function createInitialSendApi(deps:{access:()=>Promise<ProjectAccess>;db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  const p=await deps.access();if(!p.ok)return p.response
  if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)throw new SalesError('ORIGIN_REQUIRED',403)
  if(request.method==='GET'){
   const q=new URL(request.url).searchParams
   if([...q.keys()].some(k=>!['projectId','revisionId'].includes(k)||q.getAll(k).length!==1)||q.getAll('projectId').length!==1||q.getAll('revisionId').length!==1)throw new SalesError('INVALID_BODY')
   const projectId=salesId(q.get('projectId')),revisionId=salesId(q.get('revisionId'));scoped(p,projectId)
   if(!deps.enabled(projectId))return Response.json({available:false},{headers:salesHeaders})
   const value=await salesRpc<Record<string,unknown>>(deps.db(),'sales_initial_send_preview',{p_principal:p,p_input:{projectId,revisionId}})
   return Response.json({...value,available:true},{headers:salesHeaders})
  }
  const raw=await readBody(request);fields(raw,['operation','projectId','revisionId','expectedRevisionHash','expectedMailboxGeneration','expectedHistoryRevisionId','expectedRuleRevisionId','expectedPolicyVersion','acceptHistoryGap','idempotencyKey','sendJobId'])
  const projectId=salesId(raw.projectId);scoped(p,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
  const {operation,...input}=raw
  const parsed=operation==='confirm'?parseConfirmInitialSend(input):operation==='cancel'?parseSendCancel(input):(()=>{throw new SalesError('INVALID_BODY')})()
  const value=await salesRpc(deps.db(),operation==='confirm'?'sales_initial_send_confirm':'sales_initial_send_cancel',{p_principal:p,p_input:parsed})
  return Response.json(value,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const initialSendApi=createInitialSendApi({access:resolveProjectAccess,db:createAdminClient,enabled:initialSendEnabled})
