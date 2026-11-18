import 'server-only'
import {createAdminClient} from '@/lib/supabase/admin'
import {SalesError} from './types'
import {fields,salesId} from './validate'
import {salesRpc,type SalesDb} from './store'
import {workerTokenHash} from './worker-auth'
import {authenticateSalesHost,publicHostStatus} from './host-store'
import type {HostStatus,RotationReceipt} from './host-types'
import {readBody,failure,salesHeaders} from './http'
import {salesEnabled} from './feature'
function hash(v:unknown){if(typeof v!=='string'||!(/^[a-f0-9]{64}$/).test(v))throw new SalesError('INVALID_BODY');return v}
function generation(v:unknown){if(!Number.isSafeInteger(v)||Number(v)<1)throw new SalesError('INVALID_BODY');return v as number}
export function createSalesHostApi(deps:{db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  if(request.method!=='POST')return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  const tokenHash=workerTokenHash(request),v=await readBody(request)
  fields(v,['operation','managerTokenHash','rotationId','newTokenHash','expectedGeneration','generation','cliState'])
  const {operation,...input}=v
  if(operation==='adopt'){fields(input,['managerTokenHash']);input.managerTokenHash=hash(input.managerTokenHash)}
  else if(operation==='rotate'){fields(input,['rotationId','newTokenHash','expectedGeneration']);input.rotationId=salesId(input.rotationId);input.newTokenHash=hash(input.newTokenHash);input.expectedGeneration=generation(input.expectedGeneration)}
  else if(operation==='poll')fields(input,[])
  else if(operation==='report_status'){fields(input,['generation','cliState']);input.generation=generation(input.generation);if(!['ready','blocked','unknown'].includes(String(input.cliState)))throw new SalesError('INVALID_BODY')}
  else throw new SalesError('INVALID_BODY')
  const db=deps.db(),identity=operation==='adopt'?await salesRpc<{projectId:string}>(db,'sales_worker_identity',{p_token_hash:tokenHash}):await authenticateSalesHost(db,tokenHash)
  if(!deps.enabled(identity.projectId))throw new SalesError('NOT_FOUND',404)
  const r=await salesRpc<HostStatus|RotationReceipt&{workerId:string}>(db,'sales_host_'+operation,{p_token_hash:tokenHash,p_input:input})
  const result=operation==='adopt'?{workerId:salesId((r as {workerId:string}).workerId),generation:r.generation,expiresAt:(r as RotationReceipt).expiresAt}:operation==='rotate'?{generation:r.generation,expiresAt:(r as RotationReceipt).expiresAt}:publicHostStatus(r as HostStatus)
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const salesHostApi=createSalesHostApi({db:createAdminClient,enabled:salesEnabled})
