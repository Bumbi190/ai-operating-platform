import 'server-only'
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {resolveProjectAccess,type ProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {SalesError} from './types'
import {fields,salesId,text,normalizeSalesEmail,parseSalesDraft} from './validate'
import {readSalesWorkspace,prepareSalesDrafts,readSalesJob,salesRpc,scoped,type SalesDb} from './store'
import {salesHeaders,failure,readBody} from './http'
import {salesEnabled} from './feature'
type Dependencies={access:()=>Promise<ProjectAccess>;db:()=>SalesDb;enabled:(projectId:string)=>boolean}
function bool(v:unknown):boolean{if(typeof v!=='boolean')throw new SalesError('INVALID_BODY');return v}
function website(v:unknown):string|null{if(v===null)return null;const s=text(v,2048);let u:URL;try{u=new URL(s)}catch{throw new SalesError('INVALID_BODY')}if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw new SalesError('INVALID_BODY');return u.href}
export function createSalesApi(deps:Dependencies){return async(request:Request):Promise<Response>=>{
 try{
  const p=await deps.access();if(!p.ok)return p.response
  if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({code:'ORIGIN_REQUIRED'},{status:403,headers:salesHeaders})
  if(request.method==='GET'){
   const url=new URL(request.url);if([...url.searchParams.keys()].some(k=>!['projectId','jobId'].includes(k))||url.searchParams.getAll('projectId').length!==1)throw new SalesError('INVALID_BODY')
   const projectId=salesId(url.searchParams.get('projectId'));scoped(p,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
   const result=url.searchParams.has('jobId')?await readSalesJob(deps.db(),p,{projectId,jobId:salesId(url.searchParams.get('jobId'))}):await readSalesWorkspace(deps.db(),p,projectId)
   return Response.json(result,{headers:salesHeaders})
  }
  const v=await readBody(request);fields(v,['operation','projectId','id','companyName','branchName','email','websiteUrl','history','historySource','pilotMonths','confirmed','excluded','suppressed','expectedVersion','senderEmail','offerText','productFacts','freeMonths','conversationId','contactIds','offerRevisionId','idempotencyKey','revisionId','draft','jobId','workerId','action'])
  const projectId=salesId(v.projectId);scoped(p,projectId);if(!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
  const {operation,...input}=v;const db=deps.db();let result:unknown
  const call=(name:string,value:unknown)=>salesRpc(db,name,{p_principal:p,p_input:value})
  if(operation==='save_contact'){
   fields(input,['projectId','id','companyName','branchName','email','websiteUrl','history','historySource','pilotMonths','confirmed','excluded','suppressed','expectedVersion'])
   if(!['not_contacted','contacted','unknown'].includes(String(input.history))||![2,6,12].includes(Number(input.pilotMonths))||!Number.isSafeInteger(input.expectedVersion)||Number(input.expectedVersion)<0)throw new SalesError('INVALID_BODY')
   result=await call('sales_save_contact',{projectId,id:salesId(input.id),companyName:text(input.companyName,200),branchName:text(input.branchName,200,0),email:normalizeSalesEmail(text(input.email,254)),websiteUrl:website(input.websiteUrl),history:input.history,historySource:text(input.historySource,2000),pilotMonths:Number(input.pilotMonths),confirmed:bool(input.confirmed),excluded:bool(input.excluded),suppressed:bool(input.suppressed),expectedVersion:input.expectedVersion})
  }else if(operation==='save_offer'){
   fields(input,['projectId','id','senderEmail','offerText','productFacts','freeMonths','confirmed'])
   if(![2,6,12].includes(Number(input.freeMonths))||!Array.isArray(input.productFacts)||input.productFacts.length<1||input.productFacts.length>10||input.confirmed!==true)throw new SalesError('INVALID_BODY')
   result=await call('sales_save_offer',{projectId,id:salesId(input.id),senderEmail:normalizeSalesEmail(text(input.senderEmail,254)),offerText:text(input.offerText,2000),productFacts:input.productFacts.map(x=>text(x,1000)),freeMonths:input.freeMonths,confirmed:true})
  }else if(operation==='prepare')result=await prepareSalesDrafts(db,p,input as never)
  else if(operation==='revise'){
   fields(input,['projectId','revisionId','draft']);result=await call('sales_save_revision',{projectId,revisionId:salesId(input.revisionId),draft:parseSalesDraft(input.draft)})
  }else if(operation==='cancel'){
   fields(input,['projectId','jobId']);result=await call('sales_control_job',{projectId,jobId:salesId(input.jobId)})
  }else if(operation==='enroll_worker'){
   fields(input,['projectId']);const token=randomBytes(32).toString('base64url'),workerId=randomUUID()
   const receipt=await call('sales_enroll_worker',{projectId,workerId,tokenHash:createHash('sha256').update(token).digest('hex')})
   result={...(receipt as object),workerId,token,projectId}
  }else if(operation==='authorize_managed_worker'){
   fields(input,['projectId','workerId']);result=await call('sales_host_authorize',{projectId,workerId:salesId(input.workerId)})
  }else if(operation==='set_worker_desired'){
   fields(input,['projectId','workerId','action']);if(!['pause','resume','reconnect'].includes(String(input.action)))throw new SalesError('INVALID_BODY');result=await call('sales_host_set_desired',{projectId,workerId:salesId(input.workerId),action:input.action})
  }else if(operation==='revoke_worker'){
   fields(input,['projectId','workerId','action']);result=await call('sales_revoke_worker',{projectId,workerId:salesId(input.workerId)})
  }else throw new SalesError('INVALID_BODY')
  return Response.json(result,{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const salesApi=createSalesApi({access:resolveProjectAccess,db:createAdminClient,enabled:salesEnabled})
