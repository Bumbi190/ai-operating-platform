import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
import {assertProjectAllowed} from '@/lib/auth/project-access'
import {
  assessPersistedDailyPilot,
  type NewsAuditRow,type ScriptAuditRow,type PilotReadiness,
} from './daily-pilot-readiness'

type Db=ReturnType<typeof createAdminClient>
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const query=(db:Db,table:string)=>(db as unknown as {from:(name:string)=>any}).from(table)

/**
 * Owner-scoped, read-only per-script status. Admin credentials remain on the
 * server and no private media path or URL is ever returned to the caller.
 * Never returns false 'ready to publish' from unverified legacy assets.
 */
export async function inspectDailyPilotScript(
  db:Db,owner:ProjectAccessOk,projectId:string,scriptId:string,nowMs=Date.now(),
):Promise<PilotReadiness> {
  if(!UUID.test(projectId)||!UUID.test(scriptId)||
    !assertProjectAllowed(projectId,owner.allowedProjectIds))
    throw new Error('PILOT_NOT_FOUND')
  const {data:project,error:projectError}=await db.from('projects')
    .select('id').eq('id',projectId).eq('owner_id',owner.userId)
    .eq('execution_paused',false).maybeSingle()
  if(projectError)throw new Error('PILOT_AUDIT_UNAVAILABLE')
  if(!project)throw new Error('PILOT_NOT_FOUND')
  const {data:lifecycle,error:lifecycleError}=await query(db,'project_lifecycle')
    .select('state').eq('project_id',projectId).eq('owner_id',owner.userId).maybeSingle()
  if(lifecycleError)throw new Error('PILOT_AUDIT_UNAVAILABLE')
  if(lifecycle&&lifecycle.state!=='active')throw new Error('PILOT_NOT_FOUND')
  const {data:script,error:scriptError}=await query(db,'media_scripts')
    .select('id,project_id,news_item_id,hook,script,status,voice_status,audio_url,timing_url,duration_ms,images,raw_output')
    .eq('id',scriptId).eq('project_id',projectId).maybeSingle()
  if(scriptError)throw new Error('PILOT_AUDIT_UNAVAILABLE')
  if(!script)throw new Error('PILOT_NOT_FOUND')
  if(script.project_id!==projectId)throw new Error('PILOT_NOT_FOUND')
  if(!script.news_item_id)return assessPersistedDailyPilot(projectId,script as ScriptAuditRow,null,nowMs)
  const {data:news,error:newsError}=await query(db,'media_news_items')
    .select('id,project_id,title,summary,url,source_name,raw_output')
    .eq('id',script.news_item_id).eq('project_id',projectId).maybeSingle()
  if(newsError)throw new Error('PILOT_AUDIT_UNAVAILABLE')
  return assessPersistedDailyPilot(projectId,script as ScriptAuditRow,(news??null) as NewsAuditRow|null,nowMs)
}
