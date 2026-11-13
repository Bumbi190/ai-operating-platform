import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
import {salesEnabled} from '../feature'
import {salesRpc,type SalesDb} from '../store'
import {fields} from '../validate'
import {digest} from '../inbox/validate'
import {SalesError} from '../types'
import {workerTokenHash} from '../worker-auth'
import {readBody,failure,salesHeaders} from '../http'
import {parseSendRef} from './validate'
const operations={claim:'sales_send_claim',heartbeat:'sales_send_heartbeat',begin_dispatch:'sales_send_begin_dispatch',complete:'sales_send_complete',read_receipt:'sales_send_read_receipt',report_uncertain:'sales_send_report_uncertain'} as const
export function createSendWorkerApi(deps:{db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  if(request.method!=='POST')return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  const hash=workerTokenHash(request),v=await readBody(request)
  fields(v,['operation','projectId','sendJobId','workerId','claimId','generation','receipt'])
  const operation=String(v.operation)
  if(!Object.hasOwn(operations,operation))throw new SalesError('INVALID_BODY')
  const {operation:_,...input}=v
  fields(input,operation==='claim'?[]:['projectId','sendJobId','workerId','claimId','generation',...(operation==='complete'?['receipt']:[])])
  let parsed:Record<string,unknown>={}
  if(operation!=='claim'){
   const {receipt,...rest}=input;parsed=parseSendRef(rest)
   if(operation==='complete'){
    fields(receipt,['status','mimeSha256'])
    if(!['smtp_accepted','failed_before_send','delivery_unknown'].includes(String(receipt.status)))throw new SalesError('INVALID_BODY')
    parsed.receipt={status:receipt.status,mimeSha256:digest(receipt.mimeSha256)}
   }
  }
  const db=deps.db(),identity=await salesRpc<{projectId:string;workerId:string}>(db,'sales_worker_identity',{p_token_hash:hash})
  if(!deps.enabled(identity.projectId))throw new SalesError('NOT_FOUND',404)
  if(operation!=='claim'&&(parsed.projectId!==identity.projectId||parsed.workerId!==identity.workerId))throw new SalesError('FENCED',409)
  const result=await salesRpc(db,operations[operation as keyof typeof operations],{p_token_hash:hash,p_input:parsed})
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const sendWorkerApi=createSendWorkerApi({db:createAdminClient,enabled:salesEnabled})
