import 'server-only'
import {requireCronAuth} from '@/lib/api-auth'
import {createAdminClient} from '@/lib/supabase/admin'
import {readSocialContent} from '@/lib/social-launch/content/store'
import {readSchedules} from '@/lib/social-launch/scheduling/store'
import {buildFamilyWeekCoverage,FAMILY_WEEKLY_PROJECT_ID} from '@/lib/social-launch/content/family-weekly-coverage'
import {getFamilyEditorialReadiness} from '@/lib/social-launch/content/family-editorial-packs'

const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers})

/**
 * Internal read-only weekly heartbeat. Installed but NOT scheduled/enabled.
 *
 * Cron authority is authenticated independently. A fixed owner project is
 * discovered from authoritative server-side projects data (not supplied in
 * URL, client headers or caller-controlled arguments). Existing RPC readers
 * still enforce the owner/project scope. This route never creates drafts,
 * calendar entries, jobs, media, payments, publishing actions or AI calls.
 */
export async function familyWeeklyPlanningTickApi(request:Request){
 const auth=requireCronAuth(request)
 if(!auth.ok){
  for(const [k,v] of Object.entries(headers))auth.response.headers.set(k,v)
  return auth.response
 }
 if(request.method!=='GET')return json({code:'INVALID_BODY'},405)
 const url=new URL(request.url)
 if([...url.searchParams.keys()].length)return json({code:'INVALID_BODY'},400)
 if(process.env.FAMILY_WEEKLY_PLANNING_CRON_ENABLED!=='true')
  return json({mode:'read_only',result:'disabled',calls:0,costCapAiUsd:0})

 try{
  const db=createAdminClient()
  const {data:project,error}=await db.from('projects')
   .select('id,slug,owner_id').eq('id',FAMILY_WEEKLY_PROJECT_ID).maybeSingle()
  if(error||!project||project.id!==FAMILY_WEEKLY_PROJECT_ID||
    project.slug!=='familje-stunden'||
    typeof project.owner_id!=='string'||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(project.owner_id))
   return json({mode:'read_only',code:'PROJECT_UNAVAILABLE'},503)

  const principal={userId:project.owner_id,allowedProjectIds:[FAMILY_WEEKLY_PROJECT_ID]}
  // Bounded to 1 project + the two existing permission-scoped readers.
  const content=await readSocialContent(db,principal,{projectId:FAMILY_WEEKLY_PROJECT_ID})
  const schedule=await readSchedules(db,principal,{projectId:FAMILY_WEEKLY_PROJECT_ID})
  const report=buildFamilyWeekCoverage({content,schedule,now:new Date().toISOString(),daysAhead:14})
  const sources=getFamilyEditorialReadiness({
   projectId:FAMILY_WEEKLY_PROJECT_ID,planRevisionId:report.planRevisionId,
   slots:report.slots,
  })
  // Do not put private captions, tokens, media, account IDs or URLs in a cron
  // response, alert, log, or auto-triggered follow-up action.
  return json({mode:'read_only',result:'checked',asOf:report.asOf,
   projectId:FAMILY_WEEKLY_PROJECT_ID,daysAhead:14,
   summary:report.summary,nextAction:report.nextAction,
   sourceReady:sources.sourceReady,sourceMissing:sources.sourceMissing,
   actionRequired:report.summary.missing+report.summary.needsReview>0,
   draftsCreated:0,schedulesChanged:0,publicationsSent:0,aiCalls:0})
 }catch{
  // Never reveal private RPC, account or storage errors to cron caller.
  return json({mode:'read_only',code:'READ_UNAVAILABLE'},503)
 }
}
