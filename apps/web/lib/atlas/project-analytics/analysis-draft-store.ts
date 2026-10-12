import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateAnalysisReviewDraft, type AnalysisReviewDraftV1 } from './analysis-review-contract'
import { UUID, canonicalTimestamp, exactKeys } from './analysis-source-binding'
export type SavedAnalysisDraft = AnalysisReviewDraftV1 & { id: string; createdBy: string; createdAt: string }
export type AnalysisDraftEvent = {
  seq: string
  draftId: string
  kind: 'created' | 'superseded'
  supersededBy: string | null
  actorId: string
  occurredAt: string
}
export type DraftCursor = { createdAt: string; id: string }
export function encodeDraftCursor(c: DraftCursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url')
}
export function decodeDraftCursor(value: string): DraftCursor | null {
  try {
    if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null
    const c = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (
      !exactKeys(c, ['createdAt', 'id']) ||
      typeof c.id !== 'string' ||
      !UUID.test(c.id) ||
      typeof c.createdAt !== 'string' ||
      canonicalTimestamp(c.createdAt) !== c.createdAt
    )
      return null
    return c as DraftCursor
  } catch {
    return null
  }
}
export const DRAFT_COLUMNS =
  'id, project_id, schema_version, workflow_key, rule_id, rule_version, original_insight_id, evidence_hash, content_hash, source_envelope, insight, manual_steps, evaluated_at, fresh_until, created_by, created_at'
function saved(r: any): SavedAnalysisDraft {
  const d = validateAnalysisReviewDraft({
    schemaVersion: r.schema_version,
    workflowKey: r.workflow_key,
    projectId: r.project_id,
    ruleId: r.rule_id,
    ruleVersion: r.rule_version,
    originalInsightId: r.original_insight_id,
    evidenceHash: r.evidence_hash,
    contentHash: r.content_hash,
    sourceEnvelope: r.source_envelope,
    insight: r.insight,
    manualSteps: r.manual_steps,
    evaluatedAt: new Date(r.evaluated_at).toISOString(),
    freshUntil: canonicalTimestamp(r.fresh_until),
  })
  if (!d || !UUID.test(r.id) || !UUID.test(r.created_by)) throw Error('analysis_storage_unavailable')
  return { ...d, id: r.id, createdBy: r.created_by, createdAt: canonicalTimestamp(r.created_at) }
}
export class AnalysisDraftStore {
  constructor(private readonly db: any = createAdminClient()) {}
  async save(
    actorId: string,
    draft: AnalysisReviewDraftV1,
  ): Promise<{ status: 'ok'; id: string; created: boolean } | { status: 'not_found' | 'conflict' | 'unavailable' }> {
    if (!UUID.test(actorId) || !validateAnalysisReviewDraft(draft)) return { status: 'conflict' }
    try {
      const { data, error } = await this.db.rpc('atlas_save_analysis_draft', { p_actor_id: actorId, p_payload: draft })
      if (error) return { status: 'unavailable' }
      if (
        data?.status === 'ok' &&
        typeof data.id === 'string' &&
        UUID.test(data.id) &&
        typeof data.created === 'boolean'
      )
        return { status: 'ok', id: data.id, created: data.created }
      return { status: ['not_found', 'conflict'].includes(data?.status) ? data.status : 'unavailable' }
    } catch {
      return { status: 'unavailable' }
    }
  }
  async list(
    projectId: string,
    cursor: DraftCursor | null,
  ): Promise<{ items: SavedAnalysisDraft[]; nextCursor: string | null }> {
    let q = this.db.from('atlas_analysis_drafts').select(DRAFT_COLUMNS).eq('project_id', projectId)
    if (cursor) {
      if (!decodeDraftCursor(encodeDraftCursor(cursor))) throw Error('analysis_storage_unavailable')
      q = q.or(
        'created_at.lt.' + cursor.createdAt + ',and(created_at.eq.' + cursor.createdAt + ',id.lt.' + cursor.id + ')',
      )
    }
    const { data, error } = await q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(21)
    if (error || !Array.isArray(data)) throw Error('analysis_storage_unavailable')
    const items = data.slice(0, 20).map(saved),
      last = items.at(-1)
    return {
      items,
      nextCursor: data.length > 20 && last ? encodeDraftCursor({ createdAt: last.createdAt, id: last.id }) : null,
    }
  }
  async get(projectId: string, id: string): Promise<SavedAnalysisDraft | null> {
    const { data, error } = await this.db
      .from('atlas_analysis_drafts')
      .select(DRAFT_COLUMNS)
      .eq('project_id', projectId)
      .eq('id', id)
      .maybeSingle()
    if (error) throw Error('analysis_storage_unavailable')
    return data ? saved(data) : null
  }
  async events(projectId: string, draftIds: readonly string[]): Promise<AnalysisDraftEvent[]> {
    if (!draftIds.length) return []
    const { data, error } = await this.db
      .from('atlas_analysis_draft_events')
      .select('seq, draft_id, kind, superseded_by, actor_id, occurred_at')
      .eq('project_id', projectId)
      .in('draft_id', draftIds)
      .order('seq', { ascending: true })
      .limit(40)
    if (error || !Array.isArray(data)) throw Error('analysis_storage_unavailable')
    return data.map((r: any) => {
      if (
        !['created', 'superseded'].includes(r.kind) ||
        !/^\d+$/.test(String(r.seq)) ||
        !UUID.test(r.draft_id) ||
        !UUID.test(r.actor_id) ||
        (r.superseded_by !== null && !UUID.test(r.superseded_by))
      )
        throw Error('analysis_storage_unavailable')
      return {
        seq: String(r.seq),
        draftId: r.draft_id,
        kind: r.kind,
        supersededBy: r.superseded_by,
        actorId: r.actor_id,
        occurredAt: canonicalTimestamp(r.occurred_at),
      }
    })
  }
}
