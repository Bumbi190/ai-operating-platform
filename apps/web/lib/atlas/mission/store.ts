/**
 * lib/atlas/mission/store.ts — append-only mission record store.
 *
 * The only persistence boundary for Executive Mission Briefs. It exposes
 * `append` and reads: there is deliberately no update and no delete method, so
 * §20.128 ("Manager or Workforce must not silently rewrite the mission") cannot
 * be violated through this interface. The database enforces the same rule
 * independently via reject triggers.
 *
 * `atlas_mission_ledger` is service-role only; this module is server-side.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { MissionRecord } from './types'

type AnyDb = any

export interface MissionLedgerStore {
  /** Append one immutable act. Never updates or deletes. */
  append(record: MissionRecord): Promise<MissionRecord>
  /** Full lineage of one mission, canonical order. Empty when unknown. */
  lineage(missionId: string): Promise<MissionRecord[]>
  /** Every record for one project, newest first. Bounded. */
  byProject(projectId: string, limit?: number): Promise<MissionRecord[]>
}

interface Row {
  record_id: string
  mission_id: string
  record_type: string
  occurred_at: string
  project_id: string
  principal_id: string
  title: string
  mission_type: string
  executive_owner: string
  mission_owner: string | null
  objective: string
  strategic_context: string | null
  expected_outcome: string | null
  deliverables: unknown
  success_criteria: unknown
  in_scope: unknown
  out_of_scope: unknown
  constraints: unknown
  budget: unknown
  authority: unknown
  authority_source: unknown
  allowed_actions: unknown
  forbidden_actions: unknown
  tools: unknown
  data_scope: unknown
  dependencies: unknown
  assumptions: unknown
  risks: unknown
  approval_gates: unknown
  deadline: string | null
  reporting: unknown
  escalation_triggers: unknown
  stop_conditions: unknown
  pause_conditions: unknown
  completion_conditions: unknown
  evidence_requirements: unknown
  version: number
  authority_record: unknown
  decision_ref: unknown
  project_mode: string | null
  report: unknown
  dependency_observation: unknown
  gate_resolution: unknown
  blocker: unknown
  clears_blocker_id: string | null
  evidence: unknown
  closure: unknown
  review_note: string | null
  superseded_by: string | null
  reason: string | null
  lifecycle_generation: number
}

const COLS = [
  'record_id', 'mission_id', 'record_type', 'occurred_at', 'project_id', 'principal_id',
  'title', 'mission_type', 'executive_owner', 'mission_owner', 'objective',
  'strategic_context', 'expected_outcome', 'deliverables', 'success_criteria',
  'in_scope', 'out_of_scope', 'constraints', 'budget', 'authority', 'authority_source',
  'allowed_actions', 'forbidden_actions', 'tools', 'data_scope', 'dependencies',
  'assumptions', 'risks', 'approval_gates', 'deadline', 'reporting',
  'escalation_triggers', 'stop_conditions', 'pause_conditions', 'completion_conditions',
  'evidence_requirements', 'version', 'authority_record', 'decision_ref',
  'project_mode', 'report', 'dependency_observation', 'gate_resolution',
  'blocker', 'clears_blocker_id', 'evidence', 'closure', 'review_note',
  'superseded_by', 'reason', 'lifecycle_generation',
].join(', ')

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

function rowToRecord(row: Row): MissionRecord {
  return {
    recordId:   row.record_id,
    missionId:  row.mission_id,
    type:       row.record_type as MissionRecord['type'],
    occurredAt: row.occurred_at,
    projectId:  row.project_id,
    principalId: row.principal_id,
    title:      row.title,
    missionType: row.mission_type as MissionRecord['missionType'],
    executiveOwner: row.executive_owner,
    missionOwner: row.mission_owner,
    objective:  row.objective,
    strategicContext: row.strategic_context,
    expectedOutcome: row.expected_outcome,
    deliverables: arr<string>(row.deliverables),
    successCriteria: arr(row.success_criteria),
    inScope:    arr<string>(row.in_scope),
    outOfScope: arr<string>(row.out_of_scope),
    constraints: arr(row.constraints),
    budget:     (row.budget as MissionRecord['budget']) ?? null,
    authority:  arr(row.authority),
    authoritySource: (row.authority_source as MissionRecord['authoritySource']) ?? null,
    allowedActions: arr(row.allowed_actions),
    forbiddenActions: arr(row.forbidden_actions),
    tools:      arr(row.tools),
    dataScope:  arr(row.data_scope),
    dependencies: arr(row.dependencies),
    assumptions: arr(row.assumptions),
    risks:      arr(row.risks),
    approvalGates: arr(row.approval_gates),
    deadline:   row.deadline,
    reporting:  arr(row.reporting),
    escalationTriggers: arr(row.escalation_triggers),
    stopConditions: arr(row.stop_conditions),
    pauseConditions: arr(row.pause_conditions),
    completionConditions: arr<string>(row.completion_conditions),
    evidenceRequirements: arr(row.evidence_requirements),
    version:    row.version,
    authorityRecord: (row.authority_record as MissionRecord['authorityRecord']) ?? null,
    decisionRef: (row.decision_ref as MissionRecord['decisionRef']) ?? null,
    projectMode: row.project_mode,
    report:     (row.report as MissionRecord['report']) ?? null,
    dependencyObservation: (row.dependency_observation as MissionRecord['dependencyObservation']) ?? null,
    gateResolution: (row.gate_resolution as MissionRecord['gateResolution']) ?? null,
    blocker:    (row.blocker as MissionRecord['blocker']) ?? null,
    clearsBlockerId: row.clears_blocker_id,
    evidence:   (row.evidence as MissionRecord['evidence']) ?? null,
    closure:    (row.closure as MissionRecord['closure']) ?? null,
    reviewNote: row.review_note,
    supersededBy: row.superseded_by,
    reason:     row.reason,
    lifecycleGeneration: row.lifecycle_generation,
  }
}

function recordToRow(record: MissionRecord): Record<string, unknown> {
  return {
    record_id:   record.recordId,
    mission_id:  record.missionId,
    record_type: record.type,
    occurred_at: record.occurredAt,
    project_id:  record.projectId,
    principal_id: record.principalId,
    title:       record.title,
    mission_type: record.missionType,
    executive_owner: record.executiveOwner,
    mission_owner: record.missionOwner,
    objective:   record.objective,
    strategic_context: record.strategicContext,
    expected_outcome: record.expectedOutcome,
    deliverables: record.deliverables,
    success_criteria: record.successCriteria,
    in_scope:    record.inScope,
    out_of_scope: record.outOfScope,
    constraints: record.constraints,
    budget:      record.budget,
    authority:   record.authority,
    authority_source: record.authoritySource,
    allowed_actions: record.allowedActions,
    forbidden_actions: record.forbiddenActions,
    tools:       record.tools,
    data_scope:  record.dataScope,
    dependencies: record.dependencies,
    assumptions: record.assumptions,
    risks:       record.risks,
    approval_gates: record.approvalGates,
    deadline:    record.deadline,
    reporting:   record.reporting,
    escalation_triggers: record.escalationTriggers,
    stop_conditions: record.stopConditions,
    pause_conditions: record.pauseConditions,
    completion_conditions: record.completionConditions,
    evidence_requirements: record.evidenceRequirements,
    version:     record.version,
    authority_record: record.authorityRecord,
    decision_ref: record.decisionRef,
    project_mode: record.projectMode,
    report:      record.report,
    dependency_observation: record.dependencyObservation,
    gate_resolution: record.gateResolution,
    blocker:     record.blocker,
    clears_blocker_id: record.clearsBlockerId,
    evidence:    record.evidence,
    closure:     record.closure,
    review_note: record.reviewNote,
    superseded_by: record.supersededBy,
    reason:      record.reason,
    lifecycle_generation: record.lifecycleGeneration,
  }
}

class PostgresMissionLedgerStore implements MissionLedgerStore {
  private table(): AnyDb {
    return (createAdminClient() as AnyDb).from('atlas_mission_ledger')
  }

  async append(record: MissionRecord): Promise<MissionRecord> {
    const { data, error } = await this.table().insert(recordToRow(record)).select(COLS).single()
    if (error) throw new Error(`[atlas-mission-ledger] append failed: ${error.message}`)
    if (!data) throw new Error('[atlas-mission-ledger] append returned no row')
    return rowToRecord(data as Row)
  }

  async lineage(missionId: string): Promise<MissionRecord[]> {
    const { data, error } = await this.table()
      .select(COLS)
      .eq('mission_id', missionId)
      // Matches the pure core's canonical order and the lineage index. The core
      // re-sorts regardless — this is never the authority on ordering.
      .order('occurred_at', { ascending: true })
      .order('lifecycle_generation', { ascending: true })
      .order('record_id', { ascending: true })
    if (error) throw new Error(`[atlas-mission-ledger] lineage failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToRecord)
  }

  async byProject(projectId: string, limit = 200): Promise<MissionRecord[]> {
    const { data, error } = await this.table()
      .select(COLS)
      .eq('project_id', projectId)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`[atlas-mission-ledger] byProject failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToRecord)
  }
}

export function createMissionLedgerStore(): MissionLedgerStore {
  return new PostgresMissionLedgerStore()
}
