/** Read-only workflow reservation census after exact visit authorization in SQL.
 * Busy describes an active workflow containing the selected agent, never proof
 * that a model/tool is executing. Only a complete census can establish idle.
 */
export interface WorkflowDecision {
  state: 'busy' | 'idle' | 'unknown'
  coverage: 'complete' | 'incomplete'
  validUntil: number
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const id = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const stamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))

export function projectWorkflowState(facts: unknown, selection: { projectId: string; agentId: string }, now: number): WorkflowDecision {
  const unknown = (): WorkflowDecision => ({ state: 'unknown', coverage: 'incomplete', validUntil: Number.isFinite(now) ? now : 0 })
  if (!Number.isFinite(now) || !id(selection.projectId) || !id(selection.agentId)
      || !obj(facts) || facts.complete !== true || !Array.isArray(facts.runs) || facts.runs.length >= 12) return unknown()
  let expiry = now + 20_000
  const seen = new Set<string>()
  for (const run of facts.runs) {
    if (!obj(run) || !id(run.id) || seen.has(run.id) || run.project_id !== selection.projectId
        || !['pending', 'running', 'awaiting_approval'].includes(run.status as string)
        || run.finished_at !== null || run.cancel_requested !== false || run.reconciliation_required !== false
        || !Array.isArray(run.steps_snapshot) || run.steps_snapshot.length < 1 || run.steps_snapshot.length > 100) return unknown()
    seen.add(run.id)
    const orders = new Set<number>()
    let matches = false
    for (const step of run.steps_snapshot) {
      if (!obj(step) || !Number.isInteger(step.order) || (step.order as number) < 0 || (step.order as number) > 99
          || orders.has(step.order as number) || !id(step.agent_id)) return unknown()
      orders.add(step.order as number)
      matches ||= step.agent_id === selection.agentId
    }
    // SQL only emits selected-agent rows. A row escaping that projection is not
    // evidence of an empty selected-agent census and cannot be silently skipped.
    if (!matches) return unknown()
    if (run.status === 'running') {
      if (!id(run.claim_id) || !stamp(run.claimed_at) || !stamp(run.lease_until)) return unknown()
      const claimed = Date.parse(run.claimed_at), lease = Date.parse(run.lease_until)
      if (claimed > now || lease <= now || lease <= claimed) return unknown()
      expiry = Math.min(expiry, lease)
    } else if (run.claim_id !== null || run.claimed_at !== null || run.lease_until !== null) return unknown()
  }
  return { state: facts.runs.length ? 'busy' : 'idle', coverage: 'complete', validUntil: expiry }
}
