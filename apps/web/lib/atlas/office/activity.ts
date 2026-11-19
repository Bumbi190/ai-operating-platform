/** Read-only classification after SQL has verified this exact visit scope.
 * No database client, raw log content or authority is accepted here.
 */
import { identifyOutstandingAgentSteps, type CampusRunFact, type CampusLogFact } from '../campus/step-evidence'

export interface VisitStepRequest {
  kind: 'step_request_waiting_for_reply'
  runId: string
  stepOrder: number
  observedAt: string
  leaseUntil: string
}
export interface VisitActivity { available: boolean; step: VisitStepRequest | null }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const id = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)
const stamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v))
const unknown = (): VisitActivity => ({ available: false, step: null })

export function projectVisitActivity(facts: unknown, selection: { projectId: string; agentId: string }, now = Date.now()): VisitActivity {
  if (!id(selection.projectId) || !id(selection.agentId) || !Number.isFinite(now)
      || !object(facts) || facts.complete !== true || !Array.isArray(facts.runs) || !Array.isArray(facts.logs)
      || facts.runs.length >= 12 || facts.logs.length >= 120) return unknown()
  // Reject incomplete records as a whole; skipping a malformed assistant row
  // could incorrectly turn an answered request into an outstanding one.
  for (const r of facts.runs) {
    if (!object(r) || !id(r.id) || !id(r.project_id) || typeof r.status !== 'string'
        || (r.claim_id !== null && !id(r.claim_id))
        || (r.claimed_at !== null && !stamp(r.claimed_at)) || (r.lease_until !== null && !stamp(r.lease_until))
        || (r.finished_at !== null && !stamp(r.finished_at)) || typeof r.cancel_requested !== 'boolean'
        || typeof r.reconciliation_required !== 'boolean' || !Array.isArray(r.steps_snapshot)
        || r.steps_snapshot.length === 0 || r.steps_snapshot.length > 100) return unknown()
    for (const s of r.steps_snapshot) {
      if (!object(s) || !Number.isInteger(s.order) || (s.order as number) < 0 || (s.order as number) > 99 || !id(s.agent_id)) return unknown()
    }
  }
  const runIds = new Set(facts.runs.map(r => r.id))
  for (const l of facts.logs) {
    if (!object(l) || !id(l.id) || !id(l.run_id) || !runIds.has(l.run_id)
        || (l.role !== 'user' && l.role !== 'assistant') || !stamp(l.created_at)
        || !Number.isInteger(l.step_order) || (l.step_order as number) < 0 || (l.step_order as number) > 99) return unknown()
  }
  const signals = identifyOutstandingAgentSteps({ allowedAgents: new Map([[selection.projectId, new Set([selection.agentId])]]),
    runs: facts.runs as CampusRunFact[], logs: facts.logs as CampusLogFact[], complete: true, now })
  const signal = signals.get(selection.projectId + ':' + selection.agentId)
  return { available: true, step: signal ? { kind: signal.kind, runId: signal.runId, stepOrder: signal.stepOrder,
    observedAt: signal.observedAt, leaseUntil: signal.leaseUntil } : null }
}
