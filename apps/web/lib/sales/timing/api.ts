import 'server-only'
import {resolveProjectAccess,type ProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {SalesError} from '../types'
import {scoped,type SalesDb} from '../store'
import {salesEnabled} from '../feature'
import {salesHeaders,failure,readBody} from '../http'
import {readContactTiming,saveContactHistory,saveTimingRules} from './store'
import {parseTimingRead,parseHistoryRevision,parseTimingRules} from './validate'
type Dependencies={access:()=>Promise<ProjectAccess>;db:()=>SalesDb;enabled:(projectId:string)=>boolean}
export function createTimingApi(deps:Dependencies){return async(request:Request):Promise<Response>=>{
 try{
  const p=await deps.access();if(!p.ok)return p.response
  if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers:salesHeaders})
  if(request.method==='POST'&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({code:'ORIGIN_REQUIRED'},{status:403,headers:salesHeaders})
  if(request.method==='GET'){
   const u=new URL(request.url)
   if([...u.searchParams.keys()].some(k=>!['projectId','contactId'].includes(k))||u.searchParams.getAll('projectId').length!==1)throw new SalesError('INVALID_BODY')
   const ids=u.searchParams.getAll('contactId'),input=parseTimingRead({projectId:u.searchParams.get('projectId'),...(ids.length?{contactIds:ids}:{})})
   scoped(p,input.projectId);if(!deps.enabled(input.projectId))throw new SalesError('NOT_FOUND',404)
   return Response.json(await readContactTiming(deps.db(),p,input),{headers:salesHeaders})
  }
  const raw=await readBody(request)
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new SalesError('INVALID_BODY')
  const {operation,...value}=raw as Record<string,unknown>
  if(operation!=='save_history'&&operation!=='save_rules')throw new SalesError('INVALID_BODY')
  const input=operation==='save_history'?parseHistoryRevision(value):parseTimingRules(value)
  scoped(p,input.projectId);if(!deps.enabled(input.projectId))throw new SalesError('NOT_FOUND',404)
  const db=deps.db(),revision=operation==='save_history'?await saveContactHistory(db,p,input):await saveTimingRules(db,p,input)
  return Response.json({revision,timing:await readContactTiming(db,p,{projectId:input.projectId})},{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
export const timingApi=createTimingApi({access:resolveProjectAccess,db:createAdminClient,enabled:salesEnabled})
