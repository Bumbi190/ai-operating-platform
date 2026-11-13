import 'server-only'
import {createHash} from 'node:crypto'
import {createAdminClient} from '@/lib/supabase/admin'
import {SalesError} from './types'
import {fields,salesId,text,parseSalesDraft} from './validate'
import {salesRpc,type SalesDb} from './store'
import {workerTokenHash} from './worker-auth'
import {readBody,failure,salesHeaders} from './http'
import {salesEnabled} from './feature'
const operations={claim:'sales_claim_job',heartbeat:'sales_heartbeat',commit_research:'sales_commit_research',reserve_attempt:'sales_reserve_attempt',complete:'sales_commit_drafts',report_failure:'sales_report_failure'} as const
export function createSalesWorkerApi(deps:{db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  if(request.method!=='POST')return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  const hash=workerTokenHash(request),v=await readBody(request);fields(v,['operation','projectId','jobId','workerId','claimId','generation','contactId','attemptId','evidence','question','drafts'])
  const operation=String(v.operation);if(!Object.hasOwn(operations,operation))throw new SalesError('INVALID_BODY')
  const {operation:_,...input}=v
  const db=deps.db(),identity=await salesRpc<{projectId:string}>(db,'sales_worker_identity',{p_token_hash:hash})
  if(!deps.enabled(identity.projectId))throw new SalesError('NOT_FOUND',404)
  const allowed=operation==='claim'?[]:['projectId','jobId','workerId','claimId','generation',...(operation==='commit_research'?['contactId','evidence','question']:operation==='reserve_attempt'?['contactId','attemptId']:operation==='complete'?['drafts']:[])]
  fields(input,allowed)
  if(operation!=='claim'){
   for(const k of ['projectId','jobId','workerId','claimId'])input[k]=salesId(input[k])
   if(input.projectId!==identity.projectId||!Number.isSafeInteger(input.generation)||Number(input.generation)<1)throw new SalesError('FENCED',409)
  }
  if(operation==='complete'){
   if(!Array.isArray(input.drafts)||input.drafts.length<1||input.drafts.length>5)throw new SalesError('INVALID_BODY')
   input.drafts=input.drafts.map(parseSalesDraft)
  }else if(operation==='reserve_attempt'){input.contactId=salesId(input.contactId);input.attemptId=salesId(input.attemptId)}
  else if(operation==='commit_research'){
   input.contactId=salesId(input.contactId);input.question=input.question===null?null:text(input.question,500)
   if(input.evidence!==null){
    fields(input.evidence,['sourceUrl','observedAt','text','sha256']);const e=input.evidence,body=text(e.text,8192)
    if(new TextEncoder().encode(body).byteLength>8192||!/^\d{4}-\d{2}-\d{2}T/.test(String(e.observedAt))||!Number.isFinite(Date.parse(String(e.observedAt)))||Date.parse(String(e.observedAt))>Date.now()+300000||createHash('sha256').update(body).digest('hex')!==e.sha256)throw new SalesError('INVALID_BODY')
    e.text=body;e.sourceUrl=text(e.sourceUrl,2048)
   }
  }
  const result=await salesRpc(db,operations[operation as keyof typeof operations],{p_token_hash:hash,p_input:input})
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const salesWorkerApi=createSalesWorkerApi({db:createAdminClient,enabled:salesEnabled})
