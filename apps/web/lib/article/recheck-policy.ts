/**
 * A single, explicit paid recheck for a technically incomplete independent
 * article review. It NEVER publishes and never replays historical material.
 */
import { BLOCKED_FACT_REVIEW } from './daily-editorial-policy'

export interface ArticleRecheckCandidate {
  id: string
  project_id: string
  status: string
  version: number
  generated_by: string | null
  source_kind: string | null
  created_at: string
  reviewed_at: string | null
  published_at: string | null
  destination_url: string | null
  news_item_id: string | null
  external_id: string | null
  qa: unknown
}

export function eligibleForSingleArticleRecheck(
  row: ArticleRecheckCandidate | null,
  projectId: string, nowMs: number,
  allowSchemaRecovery = false,
): boolean {
  if (!row || !row.qa || typeof row.qa !== 'object' || Array.isArray(row.qa)) return false
  const qa = row.qa as Record<string, unknown>
  const fact = qa.independent_fact_review
  if (!fact || typeof fact !== 'object' || Array.isArray(fact)) return false
  const f = fact as Record<string, unknown>
  const created = Date.parse(row.created_at)
  const firstTechnicalFallback = row.version === 1 && f.passed === false
    && f.verdict === BLOCKED_FACT_REVIEW.verdict
  const secondExplicitSchemaFix = allowSchemaRecovery && row.version === 3
    && f.passed === false
    && f.verdict === 'Independent factual review invalid_tool_schema; requires human editorial review.'
  return row.project_id === projectId && row.status === 'pending_review'
    && (firstTechnicalFallback || secondExplicitSchemaFix)
    && row.generated_by === 'theprompt-website-daily-v1'
    && row.source_kind === 'news_item'
    && row.reviewed_at === null && row.published_at === null && row.destination_url === null
    && typeof row.news_item_id === 'string' && row.news_item_id.length > 0
    && row.external_id === 'omnira_' + row.news_item_id
    && qa.pass === true && qa.confidence === 'high'
    && Number.isFinite(created) && created <= nowMs
    && nowMs - created <= 48 * 60 * 60 * 1000
}
