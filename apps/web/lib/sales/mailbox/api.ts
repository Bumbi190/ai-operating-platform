import 'server-only'
import {resolveProjectAccess,type ProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {salesRpc,scoped,type SalesDb} from '../store'
import {SalesError} from '../types'
import {fields,salesId,normalizeSalesEmail,text} from '../validate'
import {salesHeaders,failure,readBody} from '../http'
import {salesEnabled} from '../feature'
import {envelope,publicContext} from './validate'
import {readMailboxStatus} from './store'
import type {MailboxContext} from './types'
export function createMailboxApi(deps:{access:()=>Promise<ProjectAccess>;db:()=>SalesDb;enabled:(projectId:string)=>boolean}){return async(request:Request):Promise<Response>=>{
 try{
  const p=await deps.access();if(!p.ok)return p.response
  if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)throw new SalesError('ORIGIN_REQUIRED',403)
  if(request.method==='GET'){
   const q=new URL(request.url).searchParams;if([...q.keys()].some(k=>!['projectId','mailboxId'].includes(k))||q.getAll('projectId').length!==1||q.getAll('mailboxId').length!==1)throw new SalesError('INVALID_BODY')
   const projectId=salesId(q.get('projectId'));scoped(p,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
   return Response.json(await readMailboxStatus(deps.db(),p,projectId,salesId(q.get('mailboxId'))),{headers:salesHeaders})
  }
  const v=await readBody(request);fields(v,['operation','projectId','workerId','email','setupId','envelope']);const projectId=salesId(v.projectId);scoped(p,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
  const {operation,...input}=v;let result:unknown
  if(operation==='begin_setup'){
   fields(input,['projectId','workerId','email']);const value={projectId,workerId:salesId(input.workerId),email:normalizeSalesEmail(text(input.email,254))}
   const r=await salesRpc<{context:MailboxContext;publicJwk:JsonWebKey}>(deps.db(),'sales_mailbox_begin_setup',{p_principal:p,p_input:value})
   result={context:publicContext(r.context),publicJwk:{kty:r.publicJwk.kty,n:r.publicJwk.n,e:r.publicJwk.e}}
  }else if(operation==='submit_sealed'){
   fields(input,['projectId','setupId','envelope']);result=await salesRpc(deps.db(),'sales_mailbox_submit_sealed',{p_principal:p,p_input:{projectId,setupId:salesId(input.setupId),envelope:envelope(input.envelope)}})
  }else throw new SalesError('INVALID_BODY')
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const mailboxApi=createMailboxApi({access:resolveProjectAccess,db:createAdminClient,enabled:salesEnabled})
