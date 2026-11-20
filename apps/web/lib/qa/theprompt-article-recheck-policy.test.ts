import { describe, expect, it } from 'vitest'
import {
  eligibleForSingleArticleRecheck, type ArticleRecheckCandidate,
} from '@/lib/article/recheck-policy'
import {
  BLOCKED_FACT_REVIEW, parseIndependentFactReview,
} from '@/lib/article/daily-editorial-policy'

const projectId = 'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const now = Date.parse('2026-11-20T02:36:00Z')
const sourceId = '9932b98e-a335-42f6-b56d-1ec625a3494b'
const row: ArticleRecheckCandidate = {
  id: '0ea8ef66-1edd-4d2f-9251-8828ab7a42be',
  project_id: projectId,
  status: 'pending_review',
  version: 1,
  generated_by: 'theprompt-website-daily-v1',
  source_kind: 'news_item',
  created_at: '2026-11-20T00:23:45Z',
  reviewed_at: null,
  published_at: null,
  destination_url: null,
  news_item_id: sourceId,
  external_id: 'omnira_' + sourceId,
  qa: {
    pass: true,
    confidence: 'high',
    independent_fact_review: BLOCKED_FACT_REVIEW,
  },
}

describe('single recent The Prompt article QA recheck', () => {
  it('permits exactly the first technically incomplete source-bound draft', () => {
    expect(eligibleForSingleArticleRecheck(row, projectId, now)).toBe(true)
  })

  it('rejects already claimed, published, reviewed or cross-tenant drafts', () => {
    const variants: Partial<ArticleRecheckCandidate>[] = [
      { version: 2 }, { status: 'published' }, { project_id: 'other' },
      { generated_by: 'atlas:operator' }, { source_kind: 'manual' },
      { reviewed_at: '2026-11-20T01:00:00Z' },
      { published_at: '2026-11-20T01:00:00Z' },
      { destination_url: 'https://theprompt.nu/articles/existing' },
      { external_id: 'omnira_wrong' }, { news_item_id: null },
      { created_at: '2026-11-16T01:00:00Z' },
      { created_at: '2026-11-23T01:00:00Z' },
    ]
    for (const patch of variants) {
      expect(eligibleForSingleArticleRecheck({ ...row, ...patch }, projectId, now))
        .toBe(false)
    }
  })

  it('rejects low QA and substantive factual objections, not just successful results', () => {
    const qa = row.qa as Record<string, unknown>
    for (const patch of [
      { pass: false },
      { confidence: 'medium' },
      { independent_fact_review: { passed: true, verdict: 'all claims supported' } },
      { independent_fact_review: { passed: false, verdict: 'invented benchmark' } },
      { independent_fact_review: null },
    ]) {
      expect(eligibleForSingleArticleRecheck({
        ...row, qa: { ...qa, ...patch },
      }, projectId, now)).toBe(false)
    }
  })

  it('remains fail-closed on malformed model data, preserves valid veto details', () => {
    const bad = { passed: true, claims_checked: 5 }
    expect(parseIndependentFactReview(bad)).toEqual(BLOCKED_FACT_REVIEW)
    const fact = {
      passed: false, source_supported: false, attributions_correct: true,
      claims_checked: 6, unsupported_claims: ['Unsupported 5x speed claim'],
      verdict: 'The original says service throughput, not individual latency.',
    }
    expect(parseIndependentFactReview(fact).passed).toBe(false)
    expect(parseIndependentFactReview(fact).unsupported_claims.length).toBe(1)
  })
})
