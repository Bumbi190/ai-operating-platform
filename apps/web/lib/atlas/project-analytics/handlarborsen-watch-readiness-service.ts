import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { getProjectBySlug } from '@/lib/project/get-project'
import { authorizeOrganizationCompetitorAction } from '@/lib/auth/organization-competitor-access'
import { isHandlarborsenProject } from '@/lib/os/project-command-center'
import { resolveExecutionStop } from '@/lib/governance/execution-stop'
import { isSpendGateEnforced } from '@/lib/cost/spend-gate-flag'
import { HANDLARBORSEN_PROJECT_ID as PROJECT, HANDLARBORSEN_PROJECT_SLUG as SLUG } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  deriveWatchReadiness,summarizeWatchBudget,type ReadinessAudience,type WatchReadiness,type WatchEnforcement,type WatchStop,
} from './handlarborsen-watch-readiness-core'

export type WatchReadinessLoad = WatchReadiness | {status:'unauthorized'|'forbidden'|'unavailable'}
interface Dependencies {
  ownerAccess:typeof resolveProjectAccess
  project:typeof getProjectBySlug
  admin:typeof createAdminClient
  collaboratorAccess:typeof authorizeOrganizationCompetitorAction
  enforced:()=>boolean
  now:()=>Date
}
const live:Dependencies={
  ownerAccess:resolveProjectAccess,project:getProjectBySlug,admin:createAdminClient,
  collaboratorAccess:authorizeOrganizationCompetitorAction,enforced:isSpendGateEnforced,now:()=>new Date(),
}
/** Server-only snapshot. The only control-plane calls are stop_state and budget_headroom. */
export function createWatchReadinessService(deps:Dependencies=live) {
  return {async load(mode:ReadinessAudience):Promise<WatchReadinessLoad>{
    if(mode!=='owner'&&mode!=='collaborator')return {status:'forbidden'}
    try {
      let db:ReturnType<typeof createAdminClient>
      if(mode==='collaborator') {
        const grant=await deps.collaboratorAccess('view_competitors')
        if(!grant.ok)return {status:grant.status}
        db=grant.db
      } else {
        const access=await deps.ownerAccess()
        if(!access.ok)return {status:'unauthorized'}
        if(!access.allowedProjectIds.includes(PROJECT))return {status:'forbidden'}
        const project=await deps.project(SLUG)
        if(!project||!isHandlarborsenProject(project))return {status:'forbidden'}
        db=deps.admin()
        const {data:current,error}=await db.from('projects').select('id,slug,name,owner_id').eq('id',PROJECT).maybeSingle()
        if(error)return {status:'unavailable'}
        if(!current||!isHandlarborsenProject(current)||current.owner_id!==access.userId)return {status:'forbidden'}
      }
      const now=deps.now()
      if(!Number.isFinite(now.getTime()))return {status:'unavailable'}
      let enforcement:WatchEnforcement='unknown'
      try {enforcement=deps.enforced()?'enforced':'advisory'}catch{/* unknown is never enforced */}
      const [stop,budget]=await Promise.allSettled([
        resolveExecutionStop(db,{context:'AUTONOMOUS',projectId:PROJECT}),
        // Server filtering plus a second exact-project check in the pure parser.
        (db as any).rpc('budget_headroom',{p_stale_minutes:30}).eq('project_id',PROJECT),
      ])
      let globalStop:WatchStop='unknown',projectStop:WatchStop='unknown'
      if(stop.status==='fulfilled'&&stop.value.context==='AUTONOMOUS') {
        if(typeof stop.value.globalPaused==='boolean')globalStop=stop.value.globalPaused?'paused':'clear'
        if(stop.value.observed?.projectFound===true&&typeof stop.value.projectPaused==='boolean')
          projectStop=stop.value.projectPaused?'paused':'clear'
      }
      return deriveWatchReadiness({
        checkedAt:now.toISOString(),enforcement,globalStop,projectStop,
        budget:budget.status==='fulfilled'&&!budget.value.error?summarizeWatchBudget(budget.value.data):'unknown',
      })
    }catch{return {status:'unavailable'}}
  }}
}
export const loadWatchReadiness=(mode:ReadinessAudience)=>createWatchReadinessService().load(mode)
