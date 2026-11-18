/** Dormant workflow-scope endpoints. Legacy identity/activity visits stay scoped. */
import { officeVisitBoundary as B, type VisitDependencies } from './visits'
import { projectWorkflowState } from './workflow-state'
export interface WorkflowVisitDependencies extends Pick<VisitDependencies, 'owner' | 'rpc'> {
  enabled(): boolean
}
const SCOPE = 'workflow_state_v1'
const PROTOCOL = 1
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function metadata(value: unknown) {
  const raw = B.record(value)
  if (raw.readScope !== SCOPE || raw.nativeWorkflowProtocol !== PROTOCOL) throw new B.Rejected(503)
  const old = B.metadata({ ...raw, readScope: undefined, nativeActivityProtocol: undefined })
  return { ...old, readScope: SCOPE, nativeWorkflowProtocol: PROTOCOL }
}
export function createWorkflowVisitHandlers(deps: WorkflowVisitDependencies) {
  const guarded = (fn: (request: Request) => Promise<Response>) => async (request: Request) => {
    try {
      if (deps.enabled() !== true) throw new B.Rejected(503)
      return await fn(request)
    } catch (error) {
      return B.reply(error instanceof B.Rejected ? error.status : 503, { error: 'Office connection unavailable' })
    }
  }
  return {
    create: guarded(async request => {
      B.sameOrigin(request)
      const owner = await deps.owner()
      if (!owner || !UUID.test(owner.ownerId) || !UUID.test(owner.sessionId)) throw new B.Rejected(401)
      const data = await B.body(request, ['visitId', 'secretDigest', 'projectId', 'agentId', 'avatarId', 'readScope', 'nativeWorkflowProtocol'])
      if (data.readScope !== SCOPE || data.nativeWorkflowProtocol !== String(PROTOCOL)
          || !UUID.test(data.projectId) || !UUID.test(data.agentId) || !/^[0-9a-f]{64}$/.test(data.secretDigest)
          || data.avatarId !== 'office-familje-pling') throw new B.Rejected(400)
      const grant = metadata(await deps.rpc('office_visit_workflow_create', {
        p_owner: owner.ownerId, p_session: owner.sessionId, p_visit: data.visitId,
        p_digest: data.secretDigest, p_project: data.projectId, p_agent: data.agentId, p_avatar: data.avatarId,
      }))
      if (grant.visitId !== data.visitId || grant.projectId !== data.projectId || grant.agentId !== data.agentId
          || grant.avatarId !== data.avatarId) throw new B.Rejected(503)
      return B.reply(200, grant)
    }),
    presence: guarded(async request => {
      const digest = B.nativeDigest(request), data = await B.body(request, ['visitId'])
      const raw = B.record(await deps.rpc('office_visit_workflow_presence', { p_visit: data.visitId, p_digest: digest }))
      const visit = metadata(raw), now = Date.now()
      if (visit.visitId !== data.visitId || typeof raw.generatedAt !== 'string') throw new B.Rejected(503)
      const observed = Date.parse(raw.generatedAt)
      if (!Number.isFinite(observed) || observed > now || now - observed >= 20_000
          || !Number.isSafeInteger(raw.workflowRevision) || (raw.workflowRevision as number) < 1) throw new B.Rejected(503)
      const decision = projectWorkflowState(raw.workflowFacts, visit, observed)
      // Keep claim-bound busy decisions shorter than identity freshness. Unknown
      // also has a bounded lease but never releases the native office hold.
      const until = Math.min(observed + 20_000, Date.parse(visit.leaseUntil), Date.parse(visit.expiresAt),
        decision.state === 'unknown' ? observed + 20_000 : decision.validUntil)
      if (until <= now) throw new B.Rejected(503)
      return B.reply(200, { schema: 'omnira.office.workflow-state.v1', scope: SCOPE,
        visit_id: visit.visitId, avatar_id: visit.avatarId, project_id: visit.projectId, agent_id: visit.agentId,
        revision: raw.workflowRevision, observed_at_unix: observed / 1000, expires_at_unix: until / 1000,
        workflow_state: decision.state, coverage: decision.coverage, execution: 'not_verified' })
    }),
  }
}
