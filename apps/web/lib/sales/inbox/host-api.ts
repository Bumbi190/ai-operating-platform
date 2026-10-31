import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
import {SalesError} from '../types'
import {salesRpc,type SalesDb} from '../store'
import {fields} from '../validate'
import {readBody,failure,salesHeaders} from '../http'
import {workerTokenHash} from '../worker-auth'
import {authenticateSalesHost} from '../host-store'
import {salesEnabled} from '../feature'
import {parseInboxBatch,ref} from './validate'
const reasons=['AUTH_FAILED','TLS_FAILED','CONNECTION_FAILED','UNSUPPORTED_MIME','RECONCILING']
function pick(v:unknown,keys:string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new SalesError('UNAVAILABLE',503);const s=v as Record<string,unknown>;return Object.fromEntries(keys.map(k=>[k,s[k]]))}
function publicReceipt(v:unknown){return v===null?null:pick(v,['accepted','batchId','cursor','records','inserted','reasonCode'])}
function publicClaim(v:unknown){if(v===null)return null;const s=pick(v,['ref','config','mailboxEmail','cursor','selectedMessages','selectedAddresses']);return {...s,ref:ref(s.ref),config:pick(s.config,['projectId','mailboxId','folder','since','selectedContactIds','version','mailboxGeneration','state','cursor','lastSyncedAt','reasonCode']),cursor:pick(s.cursor,['uidValidity','scannedThroughUid','epoch']),selectedMessages:Array.isArray(s.selectedMessages)?s.selectedMessages.map(m=>pick(m,['messageId','uid','uidValidity'])):[]}}
export function createInboxHostApi(deps:{db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  if(request.method!=='POST')return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  const hash=workerTokenHash(request),v=await readBody(request);fields(v,['operation','ref','mode','expectedCursor','uidValidity','throughUid','rangeEnd','records','projectId','mailboxId','configVersion','mailboxGeneration','hostGeneration','claimId','batchId','reasonCode']);const {operation,...input}=v
  let parsed:unknown
  if(operation==='claim_sync'){fields(input,[]);parsed={}}
  else if(operation==='read_batch_receipt')parsed=ref(input)
  else if(operation==='commit_batch')parsed=parseInboxBatch(input)
  else if(operation==='report_sync_failure'){fields(input,['ref','reasonCode']);if(!reasons.includes(String(input.reasonCode)))throw new SalesError('INVALID_BODY');parsed={ref:ref(input.ref),reasonCode:input.reasonCode}}
  else throw new SalesError('INVALID_BODY')
  const db=deps.db(),principal=await authenticateSalesHost(db,hash);if(!deps.enabled(principal.projectId))throw new SalesError('NOT_FOUND',404)
  const r=await salesRpc<Record<string,unknown>>(db,'sales_inbox_'+operation,{p_token_hash:hash,p_input:parsed})
  const result=operation==='claim_sync'?{sync:publicClaim(r.sync)}:operation==='read_batch_receipt'?{receipt:publicReceipt(r.receipt),expired:r.expired}:publicReceipt(r)
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const inboxHostApi=createInboxHostApi({db:createAdminClient,enabled:salesEnabled})
