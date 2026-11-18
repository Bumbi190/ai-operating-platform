/**
 * Bounded read-only run-step metadata reader for Agent Campus.
 *
 * Always uses the cookie-bound Supabase client (normal RLS permissions);
 * project IDs are derived ONLY from the already authenticated and scoped
 * OrganisationModel, not from a URL/query/header/body. No service-role
 * access, no run content, user prompts, tokens or application secrets.
 *
 * Logs may race with run status changes. The output is strictly "a recent
 * step request was recorded", never proof that a model is executing now.
 */
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { scopeProjectFilter } from '@/lib/atlas/isolation'
import type { OrganisationModel } from '@/lib/os/organisation'
import {
  identifyOutstandingAgentSteps,
  type CampusRunFact,
  type CampusLogFact,
  type AgentStepIndicator,
} from './step-evidence'

const MAX_RUNS = 12
const MAX_LOGS = 120

export interface ScopedStepEvidence {
  readonly available: boolean
  readonly signals: ReadonlyMap<string,AgentStepIndicator>
}
function empty(): ScopedStepEvidence{
  return {available:false,signals:new Map<string,AgentStepIndicator>()}
}

/** One explicit data refresh only – no polling and no background work. */
export async function readScopedStepEvidence(
  organisation: OrganisationModel,
  now: Date = new Date(),
): Promise<ScopedStepEvidence> {
  if (!organisation?.availability.projects || !organisation.availability.agents ||
      !Number.isFinite(now.getTime())) return empty()

  // The trusted, existing loader has already scoped these project identities.
  // Match the 25-project / 30-agent display budget used by snapshot.ts.
  const allowedProjects=organisation.projects.slice(0,25)
  const agentsByProject=new Map<string,ReadonlySet<string>>(
    allowedProjects.map(p=>[p.id,new Set(p.agents.slice(0,30).map(a=>a.id))])
  )
  if (!allowedProjects.length)return {available:true,signals:new Map()}
  if(![...agentsByProject.values()].some(ids=>ids.size))return {available:true,signals:new Map()}

  try{
    const db=await createClient()
    const {data:{user},error:authError}=await db.auth.getUser()
    if(authError || !user)return empty()

    const allowedIds=scopeProjectFilter([...agentsByProject.keys()])
    const {data:runRows,error:runError}=await db
      .from('runs')
      .select('id, project_id, status, claim_id, claimed_at, lease_until, finished_at, cancel_requested, reconciliation_required, steps_snapshot')
      .eq('status','running')
      .in('project_id',allowedIds)
      .order('created_at',{ascending:false})
      .limit(MAX_RUNS)
    if(runError || !runRows || runRows.length===MAX_RUNS)return empty()
    const runs=runRows as CampusRunFact[]
    if(!runs.length)return {available:true,signals:new Map()}

    // Project-bound run IDs above form a second, explicit restriction.
    const {data:logRows,error:logsError}=await db
      .from('run_logs')
      .select('id, run_id, step_order, role, created_at')
      .in('run_id',runs.map(r=>r.id))
      .in('role',['user','assistant'])
      .order('created_at',{ascending:false})
      .limit(MAX_LOGS)
    if(logsError || !logRows || logRows.length===MAX_LOGS)return empty()

    return {
      available:true,
      signals:identifyOutstandingAgentSteps({
        allowedAgents:agentsByProject,
        runs,
        logs:logRows as CampusLogFact[],
        now:now.getTime(),
      }),
    }
  }catch{
    return empty()
  }
}
