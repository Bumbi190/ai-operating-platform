/**
 * Server-side adapter for the append-only owner-grant event ledger.
 * Only a trusted server worker may use the service-role reader; every read
 * checks the CURRENT projects.owner_id first, never a model-supplied project.
 */
import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {WeeklyConsentReadPort} from './enrollment'

type Admin=ReturnType<typeof createAdminClient>
type SelectBuilder={
 select:(cols:string)=>SelectBuilder
 eq:(field:string,value:string)=>SelectBuilder
 order:(field:string,args:{ascending:boolean})=>SelectBuilder
 limit:(n:number)=>SelectBuilder
 maybeSingle:()=>Promise<{data:unknown;error:unknown}>
}
type Queryable={from:(table:string)=>SelectBuilder}

export function weeklyConsentReadPort(db:Admin):WeeklyConsentReadPort{
 // One restricted table name per query, no dynamic caller-provided names.
 const source=db as unknown as Queryable
 return {
  async currentProjectOwner(projectId,ownerId){
   const {data,error}=await source.from('projects').select('id')
    .eq('id',projectId).eq('owner_id',ownerId).limit(1).maybeSingle()
   if(error)throw Error('OWNER_VERIFICATION_UNAVAILABLE')
   return !!data&&typeof data==='object'&&
     (data as {id?:unknown}).id===projectId
  },
  async latestEvent(projectId){
   const {data,error}=await source.from('family_weekly_auto_consent_events')
    .select('event_id,project_id,owner_id,action,valid_until,created_at,max_completion_tokens,max_calls_per_week,can_schedule,can_publish')
    .eq('project_id',projectId).order('event_id',{ascending:false}).limit(1).maybeSingle()
   if(error)throw Error('CONSENT_LEDGER_UNAVAILABLE')
   return data??null
  },
 }
}
