/**
 * lib/atlas/decision-ledger/store.ts — append-only decision record store.
 *
 * The only persistence boundary for institutional decision history. It exposes
 * `append` and reads: there is deliberately no update and no delete method, so
 * §11.60 ("Previous versions should remain immutable… The historical record
 * should not be rewritten") cannot be violated through this interface. The
 * database enforces the same rule independently via reject triggers.
 *
 * `atlas_decision_ledger` is service-role only; this module is server-side.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { DecisionRecord } from './types'

type AnyDb = any

export interface DecisionLedgerStore {
  /** Append one immutable record. Never updates or deletes. */
  append(record: DecisionRecord): Promise<DecisionRecord>
  /** Full lineage of one decision, canonical order. Empty when unknown. */
  lineage(decisionId: string): Promise<DecisionRecord[]>
  /** Every record for one project, newest first. Bounded. */
  byProject(projectId: string, limit?: number): Promise<DecisionRecord[]>
}

interface Row {
  record_id: string
  decision_id: string
  record_type: string
  occurred_at: string
  project_id: string
  principal_id: string
  title: string
  statement: string
  recommendation: string | null
  rationale: string | null
  materiality: unknown
  authority: unknown
  evidence: unknown
  snapshot: unknown
  alternatives: unknown
  confidence: string | null
  expected_impact: string | null
  effective_at: string | null
  expires_at: string | null
  review: unknown
  reversal_conditions: unknown
  superseded_by: string | null
  version: number
  outcome: unknown
  review_note: string | null
  reason: string | null
  base_record_count: number
}

const COLS = [
  'record_id', 'decision_id', 'record_type', 'occurred_at', 'project_id', 'principal_id',
  'title', 'statement', 'recommendation', 'rationale', 'materiality', 'authority',
  'evidence', 'snapshot', 'alternatives', 'confidence', 'expected_impact',
  'effective_at', 'expires_at', 'review', 'reversal_conditions', 'superseded_by',
  'version', 'outcome', 'review_note', 'reason', 'base_record_count',
].join(', ')

function rowToRecord(row: Row): DecisionRecord {
  return {
    recordId:   row.record_id,
    decisionId: row.decision_id,
    type:       row.record_type as DecisionRecord['type'],
    occurredAt: row.occurred_at,
    projectId:  row.project_id,
    principalId: row.principal_id,
    title:      row.title,
    statement:  row.statement,
    recommendation: row.recommendation,
    rationale:  row.rationale,
    materiality: (row.materiality as DecisionRecord['materiality']) ?? [],
    authority:  (row.authority as DecisionRecord['authority']) ?? null,
    evidence:   (row.evidence as DecisionRecord['evidence']) ?? [],
    snapshot:   (row.snapshot as DecisionRecord['snapshot']) ?? null,
    alternatives: (row.alternatives as DecisionRecord['alternatives']) ?? [],
    confidence: (row.confidence as DecisionRecord['confidence']) ?? null,
    expectedImpact: row.expected_impact,
    effectiveAt: row.effective_at,
    expiresAt:  row.expires_at,
    review:     (row.review as DecisionRecord['review']) ?? null,
    reversalConditions: (row.reversal_conditions as string[]) ?? [],
    supersededBy: row.superseded_by,
    version:    row.version,
    outcome:    (row.outcome as DecisionRecord['outcome']) ?? null,
    reviewNote: row.review_note,
    reason:     row.reason,
    baseRecordCount: row.base_record_count,
  }
}

function recordToRow(record: DecisionRecord): Record<string, unknown> {
  return {
    record_id:   record.recordId,
    decision_id: record.decisionId,
    record_type: record.type,
    occurred_at: record.occurredAt,
    project_id:  record.projectId,
    principal_id: record.principalId,
    title:       record.title,
    statement:   record.statement,
    recommendation: record.recommendation,
    rationale:   record.rationale,
    materiality: record.materiality,
    authority:   record.authority,
    evidence:    record.evidence,
    snapshot:    record.snapshot,
    alternatives: record.alternatives,
    confidence:  record.confidence,
    expected_impact: record.expectedImpact,
    effective_at: record.effectiveAt,
    expires_at:  record.expiresAt,
    review:      record.review,
    reversal_conditions: record.reversalConditions,
    superseded_by: record.supersededBy,
    version:     record.version,
    outcome:     record.outcome,
    review_note: record.reviewNote,
    reason:      record.reason,
    base_record_count: record.baseRecordCount,
  }
}

class PostgresDecisionLedgerStore implements DecisionLedgerStore {
  private table(): AnyDb {
    return (createAdminClient() as AnyDb).from('atlas_decision_ledger')
  }

  async append(record: DecisionRecord): Promise<DecisionRecord> {
    const { data, error } = await this.table().insert(recordToRow(record)).select(COLS).single()
    if (error) throw new Error(`[atlas-decision-ledger] append failed: ${error.message}`)
    if (!data) throw new Error('[atlas-decision-ledger] append returned no row')
    return rowToRecord(data as Row)
  }

  async lineage(decisionId: string): Promise<DecisionRecord[]> {
    const { data, error } = await this.table()
      .select(COLS)
      .eq('decision_id', decisionId)
      .order('occurred_at', { ascending: true })
      .order('record_id', { ascending: true })
    if (error) throw new Error(`[atlas-decision-ledger] lineage failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToRecord)
  }

  async byProject(projectId: string, limit = 200): Promise<DecisionRecord[]> {
    const { data, error } = await this.table()
      .select(COLS)
      .eq('project_id', projectId)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(`[atlas-decision-ledger] byProject failed: ${error.message}`)
    return ((data ?? []) as Row[]).map(rowToRecord)
  }
}

export function createDecisionLedgerStore(): DecisionLedgerStore {
  return new PostgresDecisionLedgerStore()
}
