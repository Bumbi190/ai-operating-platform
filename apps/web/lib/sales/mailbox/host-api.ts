import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
import {SalesError} from '../types'
import {salesRpc,type SalesDb} from '../store'
import {fields,salesId} from '../validate'
import {readBody,failure,salesHeaders} from '../http'
import {workerTokenHash} from '../worker-auth'
import {authenticateSalesHost} from '../host-store'
import {salesEnabled} from '../feature'
import {publicKey,positive,receipt,publicContext,publicStatus,envelope} from './validate'
import type {MailboxContext,MailboxStatus,SealedMailboxEnvelope} from './types'
export function createMailboxHostApi(deps:{db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  if(request.method!=='POST')return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  const hash=workerTokenHash(request),v=await readBody(request);fields(v,['operation','generation','kid','jwk','setupId','claimId','hostGeneration','mailboxGeneration','receipt']);const {operation,...input}=v
  if(operation==='publish_key'){fields(input,['generation','kid','jwk']);input.generation=positive(input.generation);input.jwk=publicKey(input.jwk,input.kid)}
  else if(operation==='claim_setup')fields(input,[])
  else if(operation==='commit_probe'){fields(input,['setupId','claimId','hostGeneration','mailboxGeneration','receipt']);input.setupId=salesId(input.setupId);input.claimId=salesId(input.claimId);input.hostGeneration=positive(input.hostGeneration);input.mailboxGeneration=positive(input.mailboxGeneration);input.receipt=receipt(input.receipt)}
  else throw new SalesError('INVALID_BODY')
  const db=deps.db(),principal=await authenticateSalesHost(db,hash);if(!deps.enabled(principal.projectId))throw new SalesError('NOT_FOUND',404)
  const r=await salesRpc<Record<string,unknown>>(db,'sales_mailbox_'+operation,{p_token_hash:hash,p_input:input});let result:unknown
  if(operation==='publish_key')result={mailboxId:r.mailboxId,kid:r.kid,generation:r.generation}
  else if(operation==='claim_setup')result=r.setup===null?{setup:null}:{context:publicContext(r.context as MailboxContext),envelope:envelope(r.envelope as SealedMailboxEnvelope),claimId:salesId(r.claimId),hostGeneration:positive(r.hostGeneration),mailboxGeneration:positive(r.mailboxGeneration)}
  else result={current:r.current,mailboxGeneration:r.mailboxGeneration,status:publicStatus(r.status as MailboxStatus)}
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const mailboxHostApi=createMailboxHostApi({db:createAdminClient,enabled:salesEnabled})
