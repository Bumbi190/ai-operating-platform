import { it, expect, vi } from 'vitest'
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw Error('unscoped admin')
  },
}))
import { readMarketplaceSourceRows } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-source'
import { hashAnalysisSource } from '@/lib/atlas/project-analytics/analysis-source-binding'
import { rows, runs, NOW } from './fixtures/analysis-test-source'
const project = { id: '8f673c09-1c8f-4d78-876e-4c14bf1c89b3', slug: 'handlarborsen' },
  scope = { allowedProjectIds: [project.id] }
function db(mode = 'observer', snap = rows(), audit: any = { data: runs() }) {
  const calls: any[] = []
  return {
    calls,
    from(t: string) {
      calls.push(['from', t])
      const c: any = {
        select: (x: string) => {
          calls.push(['select', t, x])
          return c
        },
        eq: (k: string, v: string) => {
          calls.push(['eq', t, k, v])
          return c
        },
        order: (k: string) => {
          calls.push(['order', t, k])
          return c
        },
        limit: (n: number) => {
          calls.push(['limit', t, n])
          return Promise.resolve(t === 'collector_runs' ? audit : { data: snap })
        },
        maybeSingle: async () => ({ data: { ...project, atlas_mode: mode } }),
      }
      return c
    },
  }
}
it('denied_scope_never_creates_admin', async () =>
  expect(await readMarketplaceSourceRows(project, { allowedProjectIds: [] })).toEqual({ status: 'not_permitted' }))
it('fixed_id_and_slug_required', async () =>
  expect(await readMarketplaceSourceRows({ ...project, slug: 'other' }, scope)).toEqual({ status: 'not_permitted' }))
it('live_mode_before_source_reads', async () => {
  const d = db('archived')
  const r = await readMarketplaceSourceRows(project, scope, { db: d })
  expect(r.status === 'ok' && r.report.state).toBe('not_enabled')
  expect(d.calls.filter((c) => c[0] === 'from')).toEqual([['from', 'projects']])
})
it('full_30_rows_and_id_ties_bound', async () => {
  const d = db()
  const r = await readMarketplaceSourceRows(project, scope, { db: d, now: NOW })
  expect(r.status === 'ok' && r.source?.snapshots[0].id).toBe(rows()[0].id)
  expect(d.calls.filter((c) => c[0] === 'limit').map((c) => c[2])).toEqual([30, 30])
  expect(d.calls).toContainEqual(['order', 'collector_runs', 'id'])
  expect(d.calls).toContainEqual(['order', 'handlarborsen_marketplace_snapshots', 'id'])
})
it('audit_failure_keeps_report_but_blocks_save', async () => {
  const r = await readMarketplaceSourceRows(project, scope, { db: db('observer', rows(), { error: true }), now: NOW })
  expect(r.status === 'ok' && r.report.state).toBe('ok')
  expect(r.status === 'ok' && r.source?.auditReadable).toBe(false)
  expect(r.status === 'ok' && r.report.collection).toBeNull()
})
it.each(['refresh_same_uuid_changes_hash', 'older_quality_upgrade_changes_hash'])('%s', async (name) => {
  const a = await readMarketplaceSourceRows(project, scope, { db: db(), now: NOW })
  const b = await readMarketplaceSourceRows(project, scope, {
    db: db(
      'observer',
      rows({
        captured_at: '2026-10-12T10:02:00Z',
        ...(name.startsWith('older') ? { observed_at: '2026-10-12T09:00:00Z' } : {}),
      }),
    ),
    now: NOW,
  })
  if (a.status !== 'ok' || b.status !== 'ok') throw Error()
  expect(hashAnalysisSource(a.source!)).not.toBe(hashAnalysisSource(b.source!))
})
