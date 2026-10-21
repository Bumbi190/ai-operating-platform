import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('must use injected db, never production')
  },
}))

import {
  HANDLARBORSEN_PROJECT_ID,
  MARKETPLACE_METRIC_KEYS,
} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { loadHandlarborsenMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-read'
import { deriveHandlarborsenInsights } from '@/lib/atlas/project-analytics/handlarborsen-insights'

const read = (path: string) =>
  readFileSync(resolve(__dirname, '../..', path), 'utf8')

describe('Handlarbörsen: fewer network waterfalls without weakening auth', () => {
  it('portfolio route authenticates once via its scoped loader, with a real loading route', () => {
    const page = read('app/(platform)/projects/page.tsx')
    const model = read('lib/atlas/home-view-model.ts')
    const loading = read('app/(platform)/projects/loading.tsx')
    expect(page).not.toContain('createClient')
    expect(page).toContain('const model = await loadAtlasHomeViewModel()')
    expect(page).toContain("if (!model) redirect('/login')")
    expect(model).toContain('supabase.auth.getUser()')
    expect(model).toContain('getAllowedProjectIds(db, userId)')
    expect(loading).toContain('aria-busy="true"')
    expect(loading).not.toMatch(/Handlarbörsen|Fam(ilje)?/i)
  })

  it('project page streams workspace while optional, scoped report is still loading', () => {
    const page = read('app/(platform)/projects/[slug]/page.tsx')
    const loading = read('app/(platform)/projects/[slug]/loading.tsx')
    expect(page).toContain('const project = await getProjectBySlug(slug)')
    expect(page).toContain('if (!project) notFound()')
    expect(page).toContain(
      'const reportPromise = isHandlarborsenProject(project)',
    )
    expect(page).toContain(
      'loadHandlarborsenMarketplaceReport(project, { allowedProjectIds: [project.id] })',
    )
    expect(page).toContain(
      'const model = await loadProjectCommandCenter(project)',
    )
    expect(page).toContain(
      '<Suspense fallback={<ProjectCommandCenter model={model} overview={<HandlarborsenStatsLoading />} />}>',
    )
    expect(page).toContain('const result = await reportPromise')
    expect(loading).toContain('Kontrollerar åtkomst')
  })

  it('starts snapshot and audit reads together after the scope and observer gates', async () => {
    const started: string[] = []
    const pending = new Map<
      string,
      (value: { data?: unknown[]; error?: unknown }) => void
    >()
    const calls: Array<{ table: string; filter: string; value: string }> = []

    const db = {
      from(table: string) {
        if (table === 'projects') {
          const chain: any = {
            select: () => chain,
            eq: () => chain,
            maybeSingle: async () => ({
              data: {
                id: HANDLARBORSEN_PROJECT_ID,
                slug: 'handlarborsen',
                atlas_mode: 'observer',
              },
              error: null,
            }),
          }
          return chain
        }
        const chain: any = {
          select: () => chain,
          eq: (filter: string, value: string) => {
            calls.push({ table, filter, value })
            return chain
          },
          order: () => chain,
          limit: () => {
            started.push(table)
            return new Promise((resolve) => pending.set(table, resolve))
          },
        }
        return chain
      },
    }
    const request = loadHandlarborsenMarketplaceReport(
      { id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen' },
      { allowedProjectIds: [HANDLARBORSEN_PROJECT_ID] },
      { db, now: new Date('2026-10-11T10:00:00Z') },
    )

    await vi.waitFor(() => expect(started).toHaveLength(2))
    expect(started).toEqual([
      'handlarborsen_marketplace_snapshots',
      'collector_runs',
    ])
    expect(calls).toContainEqual({
      table: 'handlarborsen_marketplace_snapshots',
      filter: 'project_id',
      value: HANDLARBORSEN_PROJECT_ID,
    })
    expect(calls).toContainEqual({
      table: 'collector_runs',
      filter: 'project_id',
      value: HANDLARBORSEN_PROJECT_ID,
    })
    expect(calls).toContainEqual({
      table: 'collector_runs',
      filter: 'collector_id',
      value: 'handlarborsen.marketplace',
    })

    const snapshot = {
      project_id: HANDLARBORSEN_PROJECT_ID,
      snapshot_date: '2026-10-10',
      observed_at: '2026-10-10T10:00:00Z',
      captured_at: '2026-10-10T10:00:00Z',
      schema_version: 1,
      window_hours: 24,
      completeness: 'complete',
      unavailable: {},
      ...Object.fromEntries(MARKETPLACE_METRIC_KEYS.map((key) => [key, 1])),
    }
    pending.get('handlarborsen_marketplace_snapshots')!({
      data: [snapshot],
      error: null,
    })
    pending.get('collector_runs')!({ data: [], error: null })
    const result = await request
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.report.latest?.metrics[0].value).toBe(1)
      deriveHandlarborsenInsights(result.report, new Date('2026-10-11T10:00:00Z'))
      expect(started).toHaveLength(2) // same snapshot + audit reads, no insight storage read
    }
  })

  it('rejects wrong scope before even creating the privileged database client', async () => {
    const result = await loadHandlarborsenMarketplaceReport(
      { id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen' },
      { allowedProjectIds: [] },
    )
    expect(result).toEqual({ status: 'not_permitted' })
  })
})
