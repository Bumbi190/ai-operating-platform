import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { it, expect } from 'vitest'
import { HandlarborsenInsights } from '@/components/platform/vnext/HandlarborsenInsights'
import { AnalysisDraftHistory } from '@/components/platform/vnext/AnalysisDraftHistory'
import { AnalysisDraftSave } from '@/components/platform/vnext/AnalysisDraftSave'
import { fixture, NOW } from './fixtures/analysis-test-source'
import { buildAnalysisReviewDraft } from '@/lib/atlas/project-analytics/analysis-review-contract'
import { hashAnalysisSource } from '@/lib/atlas/project-analytics/analysis-source-binding'
;(globalThis as any).React = React
const f = fixture(),
  selector = {
    ruleId: 'company-status' as const,
    ruleVersion: 'handlarborsen-insights-1.0.0',
    expectedEvidenceHash: hashAnalysisSource(f.source!),
  },
  slug = 'handlarborsen'
const html = (report = f.report, selectors: any = undefined) =>
  renderToStaticMarkup(
    React.createElement(HandlarborsenInsights, { report, now: NOW, projectSlug: slug, analysisSelectors: selectors }),
  )
it('save_only_eligible_proposals_with_server_selectors', () => {
  expect(html()).not.toContain('Spara analysutkast')
  expect(html(f.report, { 'company-status': selector })).toContain('Spara analysutkast')
  expect(html(fixture({ companies_verified_total: 10 }).report, { 'company-status': selector })).not.toContain(
    'Spara analysutkast',
  )
})
it('save_has_accessible_name_no_optimistic_success', () => {
  const s = renderToStaticMarkup(React.createElement(AnalysisDraftSave, { slug, selector }))
  expect(s).toContain('type="button"')
  expect(s).toContain('Spara analysutkast')
  expect(s).not.toContain('Sparat analysutkast')
})
it('frozen_history_stale_superseded_new_unknown_separate', () => {
  const b = buildAnalysisReviewDraft(f.source!, f.report, selector, NOW)
  if (b.status !== 'ok') throw Error()
  const item = {
    draft: {
      ...b.draft,
      id: '00000000-0000-4000-8000-000000000020',
      createdBy: '00000000-0000-4000-8000-000000000010',
      createdAt: NOW.toISOString(),
    },
    stale: true,
    supersededBy: '00000000-0000-4000-8000-000000000021',
    applicability: 'new_evidence' as const,
  }
  const h = renderToStaticMarkup(
    React.createElement(AnalysisDraftHistory, {
      slug,
      items: [item, { ...item, applicability: 'unknown' }],
      nextCursor: 'next',
    }),
  )
  for (const text of [
    'Äldre än 26 timmar',
    'Ersatt av',
    'Nytt underlag finns',
    'Aktuell tillämplighet är okänd',
    'Granska den citerade rapporten',
    'Företagsstatus vid observationen',
    '00000000-0000-4000-8000-000000000020',
    'Nästa sida',
  ])
    expect(h).toContain(text)
  expect(h).not.toMatch(/<button|>Godkänn<|>Publicera<|>Kör analys</)
  expect(h).toContain(encodeURIComponent('next'))
})
