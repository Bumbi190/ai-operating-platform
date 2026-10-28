/**
 * Owner-only, feature-OFF-by-default consent surface; distinct from scheduler.
 * This endpoint NEVER triggers the AI model, drafts, a cron or publication.
 */
import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {createAdminClient} from '@/lib/supabase/admin'
import {createClient} from '@/lib/supabase/server'
import {FAMILY_WEEKLY_PROJECT_ID} from './auto-preparation'
import {readWeeklyOwnerConsent,familyWeeklyRuntimeEnabled} from './enrollment'
import {weeklyConsentReadPort} from './enrollment-store'
import {prepareWeeklyOwnerConsentEvent} from './enrollment-action'
import {readRecentWeeklyReviewNotices} from './review-notice-read'

const headers={
 'cache-control':'private, no-store',
 'x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer',
}
function json(value:unknown,status=200):Response{
 return Response.json(value,{status,headers})
}
type NoticesQuery={
 select:(columns:string)=>NoticesQuery
 eq:(field:string,value:string)=>NoticesQuery
 order:(field:string,args:{ascending:boolean})=>NoticesQuery
 limit:(n:number)=>Promise<{data:unknown;error:unknown}>
}
type NoticeDb={from:(table:string)=>NoticesQuery}
async function ownerNotices(ownerId:string){
 const session=await createClient()
 const db=session as unknown as NoticeDb
 return readRecentWeeklyReviewNotices({
  async list(projectId,ownerId){
   const {data,error}=await db.from('family_weekly_review_notices')
    .select('project_id,owner_id,preparation_id,week_start,draft_count,created_at,state,can_schedule,can_publish')
    .eq('project_id',projectId).eq('owner_id',ownerId)
    .order('created_at',{ascending:false}).limit(5)
   if(error)throw Error('REVIEW_NOTICE_READ_UNAVAILABLE')
   return data
  },
 },ownerId,FAMILY_WEEKLY_PROJECT_ID)
}
export function weeklyEnrollmentUiAvailable():boolean{
 return process.env.FAMILY_WEEKLY_OWNER_ENROLLMENT_UI_ENABLED==='true'
}
export async function familyWeeklyOwnerEnrollmentApi(request:Request):Promise<Response>{
 try{
  const owner=await resolveProjectAccess()
  if(!owner.ok)return owner.response
  if(!owner.allowedProjectIds.includes(FAMILY_WEEKLY_PROJECT_ID)){
   return json({code:'NOT_FOUND'},404)
  }
  if(!['GET','POST'].includes(request.method))return json({code:'METHOD_NOT_ALLOWED'},405)
  if(!weeklyEnrollmentUiAvailable()){
   return request.method==='GET'
    ? json({available:false,enabled:false,canSchedule:false,canPublish:false,
       status:'not_configured',runtimeEnabled:false})
    : json({code:'OWNER_ENROLLMENT_NOT_ENABLED'},403)
  }
  const admin=createAdminClient()
  const port=weeklyConsentReadPort(admin)
  if(request.method==='GET'){
   const u=new URL(request.url)
   if([...u.searchParams.keys()].length>0)return json({code:'INVALID_BODY'},400)
   const latest=await readWeeklyOwnerConsent(port,FAMILY_WEEKLY_PROJECT_ID,owner.userId,new Date().toISOString())
   if(latest.status==='unavailable')return json({code:'ENROLLMENT_UNAVAILABLE'},503)
   const notices=await ownerNotices(owner.userId)
   return json({available:true,runtimeEnabled:familyWeeklyRuntimeEnabled(),...latest,
    reviewNotices:notices.notices,reviewNoticesAvailable:notices.available})
  }

  // Only an actual signed-in operator click can append a consent event.
  // There is NO tool, model prompt, cron token or service_role write path.
  const blocked=assertSameOrigin(request)
  if(blocked)return blocked
  const operator=await resolvePlatformOperator()
  if(!operator.ok||operator.userId!==owner.userId){
   return json({code:'OPERATOR_REQUIRED'},403)
  }
  const length=request.headers.get('content-length')
  if(length&&(Number(length)>512||!Number.isFinite(Number(length)))){
   return json({code:'INVALID_BODY'},400)
  }
  const raw=await request.text()
  if(raw.length>512)return json({code:'INVALID_BODY'},400)
  let body:unknown
  try{body=JSON.parse(raw)}catch{return json({code:'INVALID_BODY'},400)}
  const event=prepareWeeklyOwnerConsentEvent(body,owner.userId,new Date().toISOString())
  if(!event)return json({code:'INVALID_BODY'},400)

  // Use the real authenticated Supabase *session*, not the service role.
  // Direct owner+project RLS INSERT applies even if this route regresses.
  const session=await createClient()
  type ConsentWriter={from:(table:string)=>{insert:(row:typeof event)=>Promise<{error:unknown}>}}
  const db=session as unknown as ConsentWriter
  const {error}=await db.from('family_weekly_auto_consent_events').insert(event)
  if(error)return json({code:'ENROLLMENT_UNAVAILABLE'},503)
  const latest=await readWeeklyOwnerConsent(port,FAMILY_WEEKLY_PROJECT_ID,owner.userId,new Date().toISOString())
  if(latest.status==='unavailable')return json({code:'ENROLLMENT_UNAVAILABLE'},503)
  const notices=await ownerNotices(owner.userId)
  return json({available:true,runtimeEnabled:familyWeeklyRuntimeEnabled(),...latest,
   reviewNotices:notices.notices,reviewNoticesAvailable:notices.available})
 }catch{
  return json({code:'ENROLLMENT_UNAVAILABLE'},503)
 }
}
