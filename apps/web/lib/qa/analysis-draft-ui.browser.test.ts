import { it, expect } from 'vitest'
import { startAnalysisBrowserHarness } from './fixtures/analysis-browser-harness.mjs'
import { fixture, NOW } from './fixtures/analysis-test-source'
import { hashAnalysisSource } from '@/lib/atlas/project-analytics/analysis-source-binding'
import { buildAnalysisReviewDraft } from '@/lib/atlas/project-analytics/analysis-review-contract'
it('fixture_HTTP_persistence_loss_retry_reload_pagination_and_denied_egress', async () => {
  const f = fixture(),
    selector = {
      ruleId: 'company-status' as const,
      ruleVersion: 'handlarborsen-insights-1.0.0',
      expectedEvidenceHash: hashAnalysisSource(f.source!),
    },
    b = buildAnalysisReviewDraft(f.source!, f.report, selector, NOW)
  if (b.status !== 'ok') throw Error()
  const h = await startAnalysisBrowserHarness(b.draft)
  try {
    const api = h.url + '/api/projects/handlarborsen/atlas/analysis-drafts'
    const post = (scenario = 'ok') =>
      fetch(api, {
        method: 'POST',
        headers: { 'x-fixture-scenario': scenario, 'Content-Type': 'application/json' },
        body: JSON.stringify(selector),
      })
    expect((await post('conflict')).status).toBe(409)
    expect((await post('unavailable')).status).toBe(503)
    expect(h.records.size).toBe(0)
    await expect(post('lost')).rejects.toThrow()
    expect(h.records.size).toBe(1)
    const retry = await post()
    expect(retry.status).toBe(200)
    const saved = await retry.json()
    expect(saved.id).toBe('00000000-0000-4000-8000-000000000001')
    const detail = await fetch(h.url + '/fixture/data?path=' + encodeURIComponent(saved.href))
    expect((await detail.json()).items[0].draft.id).toBe(saved.id)
    await fetch(h.url + '/fixture/seed', { method: 'POST' })
    const first = await (await fetch(h.url + '/fixture/data?path=/projects/handlarborsen/atlas/analysis-drafts')).json()
    expect(first.items).toHaveLength(20)
    expect(first.nextCursor).toBeTruthy()
    const second = await (
      await fetch(
        h.url +
          '/fixture/data?path=' +
          encodeURIComponent('/projects/handlarborsen/atlas/analysis-drafts?cursor=' + first.nextCursor),
      )
    ).json()
    expect(second.items).toHaveLength(1)
    expect(new Set([...first.items, ...second.items].map((x) => x.draft.id)).size).toBe(21)
    expect(h.allows('https://external.invalid')).toBe(false)
    expect(h.calls.every((x) => x.startsWith('/'))).toBe(true)
  } finally {
    await h.close()
  }
}, 30000)
