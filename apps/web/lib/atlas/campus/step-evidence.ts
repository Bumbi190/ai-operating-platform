/**
 * Conservative per-agent run-step evidence for the Agent Campus.
 *
 * This is NOT proof a model is presently generating tokens or that a task
 * succeeded. It only means a recent user step-request was recorded while the
 * same run still has a current claim/lease, and no later assistant reply is
 * seen. Never label it "executing"/"success"/"active agent".
 *
 * Every run comes from a project-scoped authenticated read; every agent
 * comes from the already scoped OrganisationModel. No content or prompts
 * are ever accessed or returned.
 */
export interface CampusRunFact {
  id: string
  project_id: string
  status: string
  claim_id: string | null
  claimed_at: string | null
  lease_until: string | null
  finished_at: string | null
  cancel_requested: boolean
  reconciliation_required: boolean
  steps_snapshot: unknown
}
export interface CampusLogFact {
  id: string
  run_id: string
  step_order: number | null
  role: string
  created_at: string
}

export interface AgentStepIndicator {
  readonly projectId: string
  readonly agentId: string
  readonly runId: string
  readonly stepOrder: number
  readonly observedAt: string
  readonly leaseUntil: string
  readonly kind: 'step_request_waiting_for_reply'
  readonly label: 'Steg skickat – väntar på svar (loggindikation)'
  readonly source: 'claimed_run_and_step_log'
}

const REQUEST_FRESHNESS_MS = 90_000
const CLOCK_SKEW_MS = 2_000
const ID = /^[a-zA-Z0-9-]{3,128}$/

function clock(iso: string | null | undefined): number {
  if (typeof iso!=='string') return NaN
  return Date.parse(iso)
}

function ownerForStep(steps: unknown, stepOrder: number): string | null {
  if (!Array.isArray(steps) || steps.length===0 || steps.length>100) return null
  let matched: string | null = null
  for (const step of steps) {
    if (!step || typeof step!=='object')return null
    const candidate=step as {order?:unknown,agent_id?:unknown}
    if (candidate.order !== stepOrder) continue
    if (matched || typeof candidate.agent_id!=='string' ||
        !ID.test(candidate.agent_id)) return null
    matched=candidate.agent_id
  }
  return matched
}

/**
 * @param allowedAgents: Map(projectId -> Set(agentId)), derived from the
 * *authenticated* OrganisationModel, never supplied by browser arguments.
 * @param complete: caller has proven the bounded run/log query was not
 * truncated or errored. Unknown means no positive evidence.
 */
export function identifyOutstandingAgentSteps({
  allowedAgents,
  runs,
  logs,
  now = Date.now(),
  complete = true,
}:{
  allowedAgents: ReadonlyMap<string, ReadonlySet<string>>
  runs: readonly CampusRunFact[]
  logs: readonly CampusLogFact[]
  now?: number
  complete?: boolean
}): ReadonlyMap<string, AgentStepIndicator> {
  const result = new Map<string,AgentStepIndicator>()
  if (!complete || !Number.isFinite(now) || !allowedAgents?.size) return result

  const byRun = new Map<string,CampusLogFact[]>()
  for(const log of logs){
    if (!ID.test(log.run_id) || !Number.isFinite(clock(log.created_at))) continue
    const list=byRun.get(log.run_id)??[]
    list.push(log)
    byRun.set(log.run_id,list)
  }

  // An agent could have multiple parallel runs. If the captured records
  // conflict, show unknown instead of arbitrarily choosing one.
  const ambiguous=new Set<string>()
  for(const run of runs) {
    const allowed=allowedAgents.get(run.project_id)
    if (!allowed?.size || !ID.test(run.id) || run.status!=='running' ||
        !ID.test(run.claim_id??'') ||
        run.cancel_requested!==false || run.reconciliation_required!==false ||
        run.finished_at!==null) continue
    const leaseUntil=clock(run.lease_until)
    const claimed=clock(run.claimed_at)
    if (!Number.isFinite(leaseUntil) || !Number.isFinite(claimed) ||
        claimed>now+CLOCK_SKEW_MS || leaseUntil<=now+CLOCK_SKEW_MS ||
        leaseUntil<=claimed) continue

    const currentLogs=byRun.get(run.id)??[]
    if(!currentLogs.length)continue
    currentLogs.sort((a,b)=>clock(b.created_at)-clock(a.created_at))
    const latest=currentLogs[0]
    // Equal timestamps cannot establish whether the user prompt was followed
    // by an assistant reply. No offset-based guess on id UUID ordering.
    if(currentLogs.length>1 &&
       clock(latest.created_at)===clock(currentLogs[1].created_at))continue
    const stamp=clock(latest.created_at)
    if(latest.role!=='user' || !Number.isInteger(latest.step_order) ||
       stamp<claimed-CLOCK_SKEW_MS || stamp>now+CLOCK_SKEW_MS ||
       now-stamp>REQUEST_FRESHNESS_MS || now-stamp<0)continue
    const agentId=ownerForStep(run.steps_snapshot,latest.step_order!)
    if(!agentId || !allowed.has(agentId))continue
    const key=run.project_id+':'+agentId
    if(ambiguous.has(key))continue
    if(result.has(key)){
      result.delete(key)
      ambiguous.add(key)
      continue
    }
    result.set(key,{
      projectId:run.project_id,
      agentId,
      runId:run.id,
      stepOrder:latest.step_order!,
      observedAt:latest.created_at,
      leaseUntil:run.lease_until!,
      kind:'step_request_waiting_for_reply',
      label:'Steg skickat – väntar på svar (loggindikation)',
      source:'claimed_run_and_step_log',
    })
  }
  return result
}
