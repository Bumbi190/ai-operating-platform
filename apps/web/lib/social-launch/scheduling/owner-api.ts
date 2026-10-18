import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {contentFields} from '../content/validate'
import {boundedPublicationBody} from '../publication/api'
import {PublicationError} from '../publication/types'
import {ScheduleError} from './types'
import {readSchedules,proposeSchedule,approveSchedule,revokeSchedule,saveMonthlyRule,recordReleaseEvidence,scheduleDispatchEnabled} from './store'
import {monthlyPlanningSlots} from './planning'
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
export async function socialSchedulesOwnerApi(request:Request){
 try{
  const p=await resolveProjectAccess();if(!p.ok)return p.response
  if(!['GET','POST'].includes(request.method))return Response.json({code:'INVALID_BODY'},{status:405,headers})
  if(request.method==='POST'){const denied=assertSameOrigin(request);if(denied)return denied}
  const operator=await resolvePlatformOperator(),canManage=operator.ok&&operator.userId===p.userId,db=createAdminClient()
  if(request.method==='GET'){
   const u=new URL(request.url);if([...u.searchParams.keys()].some(k=>k!=='projectId')||u.searchParams.getAll('projectId').length!==1)throw new ScheduleError('INVALID_BODY')
   const projectId=u.searchParams.get('projectId')!
   const view=await readSchedules(db,p,{projectId})
   return Response.json({...view,canManage,dispatchEnabled:scheduleDispatchEnabled(projectId),monthlySlots:monthlyPlanningSlots(new Date().toISOString(),view.batches)},{headers})
  }
  if(!canManage)return Response.json({code:'OPERATOR_REQUIRED'},{status:403,headers})
  const body=await boundedPublicationBody(request)
  const allowed:Record<string,string[]>={propose:['projectId','manifest','expectedRevisionId','idempotencyKey'],approve:['projectId','batchId','revisionId','sha256','confirmed','idempotencyKey'],revoke:['projectId','batchId','expectedVersion'],monthly_rule_save:['projectId','rule'],release_confirm:['projectId','releaseMonth','catalogSha256','customerViewUrl','confirmed']}
  const op=(body as any)?.operation
  if(typeof op!=='string'||!allowed[op])throw new ScheduleError('INVALID_BODY')
  try{contentFields(body,['operation',...allowed[op]])}catch{throw new ScheduleError('INVALID_BODY')}
  const {operation,...input}=body as Record<string,unknown>
  if(!p.allowedProjectIds.includes(input.projectId as string))throw new ScheduleError('NOT_FOUND')
  let result
  if(operation==='propose')result=await proposeSchedule(db,p,input as Parameters<typeof proposeSchedule>[2])
  else if(operation==='approve')result=await approveSchedule(db,p,input as Parameters<typeof approveSchedule>[2])
  else if(operation==='revoke')result=await revokeSchedule(db,p,input as Parameters<typeof revokeSchedule>[2])
  else if(operation==='monthly_rule_save')result=await saveMonthlyRule(db,p,input as Parameters<typeof saveMonthlyRule>[2])
  else result=await recordReleaseEvidence(db,p,input as Parameters<typeof recordReleaseEvidence>[2])
  return Response.json(result,{headers})
 }catch(error){
  const e=error instanceof ScheduleError?error:error instanceof PublicationError&&error.code==='INVALID_BODY'?new ScheduleError('INVALID_BODY'):new ScheduleError('UNAVAILABLE')
  return Response.json({code:e.code},{status:e.status,headers})
 }
}
