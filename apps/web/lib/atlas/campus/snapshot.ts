/**
 * Agent Campus read-only snapshot v1.
 *
 * Source of truth: existing lib/os/organisation.ts. Its server loader verifies
 * the signed-in user and scopes project/agent/run reads through
 * getAllowedProjectIds and scopeProjectFilter BEFORE returning this model.
 *
 * A run's workflow can refer to multiple agent IDs; this does NOT prove the
 * individual agent is executing a step right now. Only workflow association
 * is exposed, never a "typing"/"executing" claim.
 * Missing reads stay unknown, never fabricated as zero or idle.
 */
import type { OrganisationModel } from '@/lib/os/organisation'
import type { AgentStepIndicator } from './step-evidence'

export type CampusMembershipEvidence =
  | 'listed_in_running_workflow'
  | 'not_listed_in_running_workflow'
  | 'unavailable'

export interface CampusAgentView {
  readonly id: string
  readonly name: string
  readonly membershipEvidence: CampusMembershipEvidence
  readonly executionEvidence: 'unavailable'
  /** Recent sent-step evidence ONLY. Not proof of current token generation. */
  readonly stepRequest: Pick<AgentStepIndicator,'kind'|'label'|'runId'|'stepOrder'|'observedAt'> | null
}

export interface CampusProjectView {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly color: string
  readonly runningRuns: number | null
  readonly runningRunsLabel: string
  readonly agents: readonly CampusAgentView[]
  readonly additionalAgentsNotShown: number
}

export interface CampusReadSnapshot {
  readonly schemaVersion: 2
  readonly dataSource: 'authorized_organisation_read'
  /** Time of *this server read*, NOT last activity or last agent heartbeat. */
  readonly generatedAt: string
  readonly liveData: true
  readonly projectCount: number
  readonly additionalProjectsNotShown: number
  readonly availability: {
    readonly projects: boolean
    readonly agents: boolean
    readonly activity: boolean
    readonly stepEvidence: boolean
  }
  readonly projects: readonly CampusProjectView[]
  readonly explanation: string
}

const PROJECT_LIMIT = 25
const AGENT_LIMIT_PER_PROJECT = 30
const DEFAULT_COLOR = '#6366f1'
const UUIDISH = /^[0-9a-z-]{3,128}$/i
const HEX = /^#[0-9a-fA-F]{6}$/
const safeText=(text:string,max:number) =>
  text.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max)

export function projectCampusSnapshot(
  model: OrganisationModel,
  now: Date = new Date(),
  stepSignals: ReadonlyMap<string,AgentStepIndicator> | null = null,
): CampusReadSnapshot | null {
  // Do not interpret a failed projects read as an empty portfolio.
  if (!model || model.availability.projects !== true) return null
  if (!Number.isFinite(now.getTime())) throw new TypeError('invalid generatedAt')

  const projects: CampusProjectView[] = []
  for (const project of model.projects.slice(0,PROJECT_LIMIT)) {
    if (!UUIDISH.test(project.id) || !project.slug || !project.name) continue
    const agents: CampusAgentView[] = []
    for (const agent of project.agents.slice(0,AGENT_LIMIT_PER_PROJECT)) {
      if (!UUIDISH.test(agent.id)) continue
      // The existing organisation model exposes a portfolio-wide boolean
      // "working" derived from workflow steps. It does not prove this agent
      // belongs to this *specific* project's running run, nor that the step
      // is actually executing. Until a per-run+project+agent proof exists,
      // fail closed instead of showing possibly incorrect agent activity.
      const current=stepSignals?.get(project.id+':'+agent.id)
      agents.push({
        id:agent.id,
        name:safeText(agent.name,80),
        membershipEvidence:'unavailable',
        executionEvidence:'unavailable',
        stepRequest:current ? {
          kind:current.kind,label:current.label,runId:current.runId,
          stepOrder:current.stepOrder,observedAt:current.observedAt,
        } : null,
      })
    }
    const count=model.availability.activity && Number.isInteger(project.runningRuns)
      && project.runningRuns!==null && project.runningRuns>=0
      ? project.runningRuns : null
    projects.push({
      id:project.id,
      slug:safeText(project.slug,64),
      name:safeText(project.name,80),
      color:HEX.test(project.color)?project.color:DEFAULT_COLOR,
      runningRuns:count,
      runningRunsLabel:count===null?'Ej tillgänglig':
        count===0?'Inga pågående körningar registrerade':
        String(count)+' pågående körning'+(count===1?'':'ar')+' registrerade',
      agents,
      additionalAgentsNotShown:Math.max(0,project.agents.length-AGENT_LIMIT_PER_PROJECT),
    })
  }

  return {
    schemaVersion:2,
    dataSource:'authorized_organisation_read',
    generatedAt:now.toISOString(),
    liveData:true,
    projectCount:model.projects.length,
    additionalProjectsNotShown:Math.max(0,model.projects.length-PROJECT_LIMIT),
    availability:{
      projects:model.availability.projects,
      agents:model.availability.agents,
      activity:model.availability.activity,
      stepEvidence:stepSignals!==null,
    },
    projects,
    explanation:'En färsk stegbegäran i körningsloggen är inte bevis på att modellen genererar svar just nu. '+
      'Saknade läsningar visas som okända; inga uppgifter kan godkännas eller startas här.',
  }
}
