import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import {SalesError,type SalesPrincipal,type SalesWorkspace,type SalesJobSummary,type PrepareSalesInput,type SalesJobRef} from './types'
import {salesId,parsePrepareSalesInput} from './validate'
export type SalesDb=ReturnType<typeof createAdminClient>
export function scoped(p:SalesPrincipal,projectId:string){salesId(p.userId);salesId(projectId);if(!p.allowedProjectIds.includes(projectId))throw new SalesError('NOT_FOUND',404)}
export async function salesRpc<T>(db:SalesDb,name:string,args:Record<string,unknown>):Promise<T>{
 const {data,error}=await (db as unknown as {rpc:(n:string,a:Record<string,unknown>)=>Promise<{data:unknown;error:{code?:string;message?:string}|null}>}).rpc(name,args)
 if(error){const code=error.code==='P0002'||error.code==='42501'?'NOT_FOUND':error.code==='23505'?'REVISION_CONFLICT':error.code==='40001'?'FENCED':error.code==='55000'?'STOPPED':error.code==='22023'?'INVALID_BODY':'UNAVAILABLE';throw new SalesError(code,code==='NOT_FOUND'?404:code==='UNAVAILABLE'?503:409)}
 if(data===null||data===undefined)throw new SalesError('UNAVAILABLE',503);return data as T
}
export async function readSalesWorkspace(db:SalesDb,p:SalesPrincipal,projectId:string):Promise<SalesWorkspace>{scoped(p,projectId);return salesRpc(db,'sales_read_workspace',{p_principal:p,p_input:{projectId}})}
export async function prepareSalesDrafts(db:SalesDb,p:SalesPrincipal,value:PrepareSalesInput):Promise<SalesJobSummary>{const input=parsePrepareSalesInput(value);scoped(p,input.projectId);return salesRpc(db,'sales_prepare_job',{p_principal:p,p_input:input})}
export async function readSalesJob(db:SalesDb,p:SalesPrincipal,ref:SalesJobRef):Promise<SalesJobSummary>{scoped(p,ref.projectId);salesId(ref.jobId);return salesRpc(db,'sales_read_job',{p_principal:p,p_input:ref})}
