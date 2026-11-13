import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
import {salesEnabled} from '../feature'
import {salesRpc,type SalesDb} from '../store'
import {fields,salesId} from '../validate'
import {SalesError} from '../types'
import {workerTokenHash} from '../worker-auth'
import {readBody,failure,salesHeaders} from '../http'
import {parseReplyRef,parseReplyDraft} from './validate'
const operations={claim:'sales_reply_claim',heartbeat:'sales_reply_heartbeat',reserve_attempt:'sales_reply_reserve_attempt',complete:'sales_reply_complete',read_receipt:'sales_reply_read_receipt',report_failure:'sales_reply_report_failure'} as const
export function createReplyWorkerApi(deps:{db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  if(request.method!=='POST')return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  const hash=workerTokenHash(request),v=await readBody(request);fields(v,['operation','projectId','jobId','workerId','claimId','generation','attemptId','draft'])
  const operation=String(v.operation);if(!Object.hasOwn(operations,operation))throw new SalesError('INVALID_BODY')
  const {operation:_,...input}=v
  fields(input,operation==='claim'?[]:['projectId','jobId','workerId','claimId','generation',...(operation==='reserve_attempt'||operation==='complete'?['attemptId']:[]),...(operation==='complete'?['draft']:[])])
  let parsed:Record<string,unknown>={}
  if(operation!=='claim'){
   const {attemptId,draft,...rest}=input;parsed=parseReplyRef(rest)
   if(operation==='reserve_attempt'||operation==='complete')parsed.attemptId=salesId(attemptId)
   if(operation==='complete')parsed.draft=parseReplyDraft(draft)
  }
  const db=deps.db(),identity=await salesRpc<{projectId:string;workerId:string}>(db,'sales_worker_identity',{p_token_hash:hash})
  if(!deps.enabled(identity.projectId))throw new SalesError('NOT_FOUND',404)
  if(operation!=='claim'&&(parsed.projectId!==identity.projectId||parsed.workerId!==identity.workerId))throw new SalesError('FENCED',409)
  const result=await salesRpc(db,operations[operation as keyof typeof operations],{p_token_hash:hash,p_input:parsed})
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const replyWorkerApi=createReplyWorkerApi({db:createAdminClient,enabled:salesEnabled})
