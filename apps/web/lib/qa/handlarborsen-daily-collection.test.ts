import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createElement } from 'react'
// vitest compiles JSX with the classic transform: components need React in scope.
;(globalThis as unknown as { React: typeof React }).React = React
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => { throw new Error('createAdminClient must not run in this test') },
}))

import { HANDLARBORSEN_PROJECT_ID, MARKETPLACE_METRIC_KEYS } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  COLLECTION_RUN_SELECT,
  COLLECTOR_ID,
  buildCollectionStatus,
  buildMarketplaceReport,
  renderHandlarborsenFactBlock,
} from '@/lib/atlas/project-analytics/handlarborsen-marketplace-report'
import { loadHandlarborsenMarketplaceReport } from '@/lib/atlas/project-analytics/handlarborsen-marketplace-read'
import { buildHandlarborsenOverview } from '@/lib/atlas/project-analytics/handlarborsen-overview'
import { HandlarborsenOverview } from '@/components/platform/vnext/HandlarborsenOverview'
import { HandlarborsenMarketplaceReport } from '@/components/platform/vnext/HandlarborsenMarketplaceReport'

const NOW = new Date('2026-10-11T08:00:00.000Z')

function snapshot(date: string, observedAt: string, over: Record<string, unknown> = {}, bump = 0) {
  const base: Record<string, unknown> = {
    project_id: HANDLARBORSEN_PROJECT_ID, snapshot_date: date, observed_at: observedAt, captured_at: observedAt,
    schema_version: 1, window_hours: 24, completeness: 'complete', unavailable: {},
  }
  MARKETPLACE_METRIC_KEYS.forEach((k, i) => { base[k] = 100 + i + bump })
  return { ...base, ...over }
}
const run = (status: string, ranAt: string, date: string, storage_outcome: string | null = null) =>
  ({ status, ran_at: ranAt, snapshot_date: date, storage_outcome })

describe('buildCollectionStatus — what the collector audit rows say', () => {
  it('no rows: nothing is claimed (no success, no attempt, nothing "today")', () => {
    const s = buildCollectionStatus([], NOW)
    expect(s).toMatchObject({ lastSuccess: null, lastAttempt: null, today: 'none', latestAttemptFailed: false, todayDate: '2026-10-11' })
  })

  it('reports the last successful collection with its age', () => {
    const s = buildCollectionStatus([
      run('ok', '2026-10-11T06:55:03.000Z', '2026-10-11', 'inserted'),
      run('ok', '2026-10-10T10:22:49.000Z', '2026-10-10', 'inserted'),
    ], NOW)
    expect(s.lastSuccess).toMatchObject({ ranAt: '2026-10-11T06:55:03.000Z', snapshotDate: '2026-10-11' })
    expect(s.lastSuccess!.ageHours).toBeCloseTo(1.08, 1)
    expect(s.today).toBe('stored')
    expect(s.latestAttemptFailed).toBe(false)
  })

  it("today's failure is reported as failed, and the last success stays the earlier one", () => {
    const s = buildCollectionStatus([
      run('error', '2026-10-11T06:55:04.000Z', '2026-10-11'),
      run('ok', '2026-10-10T06:55:03.000Z', '2026-10-10', 'inserted'),
    ], NOW)
    expect(s.today).toBe('failed')
    expect(s.latestAttemptFailed).toBe(true)
    expect(s.lastSuccess!.snapshotDate).toBe('2026-10-10')
  })

  it('a run that kept a better stored report is NOT a failure', () => {
    const s = buildCollectionStatus([
      run('skipped', '2026-10-11T07:30:00.000Z', '2026-10-11', 'rejected'),
      run('ok', '2026-10-11T06:55:03.000Z', '2026-10-11', 'inserted'),
    ], NOW)
    expect(s.today).toBe('stored')
    expect(s.latestAttemptFailed).toBe(false)
    const onlyKept = buildCollectionStatus([run('skipped', '2026-10-11T07:30:00.000Z', '2026-10-11', 'unchanged')], NOW)
    expect(onlyKept.today).toBe('kept_existing')
    expect(onlyKept.latestAttemptFailed).toBe(false)
  })

  it('a skipped run with no storage outcome (no access) counts as a failed collection', () => {
    const s = buildCollectionStatus([run('skipped', '2026-10-11T06:55:00.000Z', '2026-10-11')], NOW)
    expect(s.today).toBe('failed')
    expect(s.latestAttemptFailed).toBe(true)
  })

  it('an old failure does not mark today as failed', () => {
    const s = buildCollectionStatus([run('error', '2026-10-09T06:55:00.000Z', '2026-10-09')], NOW)
    expect(s.today).toBe('none')
    expect(s.latestAttemptFailed).toBe(true) // the newest attempt is still a failure
  })

  it('ignores malformed rows instead of guessing', () => {
    const s = buildCollectionStatus([null, 'x', { status: 'weird', ran_at: 'nope' }, run('ok', 'not-a-date', '2026-10-11'), run('ok', '2026-10-11T06:55:03.000Z', 'bad')], NOW)
    expect(s).toMatchObject({ lastSuccess: null, lastAttempt: null, today: 'none' })
  })
})

describe('report model: history series and collection', () => {
  const rows = [
    snapshot('2026-10-11', '2026-10-11T06:55:00.000Z', {}, 10),
    snapshot('2026-10-10', '2026-10-10T06:55:00.000Z', {}, 5),
    snapshot('2026-10-09', '2026-10-09T06:55:00.000Z', {}, 0),
  ]

  it('exposes every valid saved day, newest first, with the real values', () => {
    const report = buildMarketplaceReport(rows, NOW, [])
    expect(report.history.series.map((s) => s.snapshotDate)).toEqual(['2026-10-11', '2026-10-10', '2026-10-09'])
    expect(report.history.series[2].metrics[0].value).toBe(100)
    expect(report.history.series[0].metrics[0].value).toBe(110)
  })

  it('collection is null when the audit rows are not supplied, and present (even if empty) when they are', () => {
    expect(buildMarketplaceReport(rows, NOW).collection).toBeNull()
    expect(buildMarketplaceReport(rows, NOW, [])?.collection?.today).toBe('none')
    expect(buildMarketplaceReport([], NOW, [run('error', '2026-10-11T06:55:00.000Z', '2026-10-11')]).collection?.today).toBe('failed')
  })

  it('the report stays valid and complete-flag based exactly as before', () => {
    const report = buildMarketplaceReport(rows, NOW, [])
    expect(report.state).toBe('ok')
    expect(report.latest?.completeness).toBe('complete')
  })
})

describe('overview: nothing says the collection is "not scheduled", and nothing is invented', () => {
  const rows = [snapshot('2026-10-11', '2026-10-11T06:55:00.000Z', {}, 10), snapshot('2026-10-10', '2026-10-10T06:55:00.000Z')]
  const okRun = run('ok', '2026-10-11T06:55:03.000Z', '2026-10-11', 'inserted')
  const kpi = (r: ReturnType<typeof buildMarketplaceReport>) => {
    const m = buildHandlarborsenOverview(r)
    if (m.kind !== 'kpi') throw new Error('expected kpi')
    return m
  }
  const html = (r: ReturnType<typeof buildMarketplaceReport>) =>
    renderToStaticMarkup(createElement(HandlarborsenOverview, { report: r, reportHref: '/projects/handlarborsen/marketplace' }))

  it('shows last successful collection and how today went', () => {
    const m = kpi(buildMarketplaceReport(rows, NOW, [okRun]))
    expect(m.meta.map((x) => x.label)).toEqual(['Uppmätt', 'Aktualitet', 'Datakvalitet', 'Senaste lyckade insamling', 'Dagens insamling'])
    expect(m.meta.find((x) => x.label === 'Dagens insamling')).toMatchObject({ value: 'Rapport sparad', tone: 'ok' })
    expect(m.notices).toEqual([])
  })

  it("flags today's failure and still shows the last saved report", () => {
    const yesterdayRun = run('ok', '2026-10-10T06:55:03.000Z', '2026-10-10', 'inserted')
    const m = kpi(buildMarketplaceReport(rows, NOW, [run('error', '2026-10-11T06:55:04.000Z', '2026-10-11'), yesterdayRun]))
    expect(m.meta.find((x) => x.label === 'Dagens insamling')).toMatchObject({ value: 'Insamlingen misslyckades', tone: 'warning' })
    expect(m.notices.map((n) => n.text).join(' ')).toMatch(/senaste insamlingsförsöket misslyckades/)
  })

  it('with no audit rows it claims neither success nor failure', () => {
    const m = kpi(buildMarketplaceReport(rows, NOW, []))
    expect(m.meta.find((x) => x.label === 'Senaste lyckade insamling')?.value).toBe('Ingen lyckad insamling registrerad')
    expect(m.meta.find((x) => x.label === 'Dagens insamling')).toMatchObject({ value: 'Ingen körning registrerad ännu idag' })
    expect(m.meta.find((x) => x.label === 'Dagens insamling')?.tone).toBeUndefined()
    expect(m.notices).toEqual([])
  })

  it('unreadable audit rows add no collection lines at all', () => {
    const m = kpi(buildMarketplaceReport(rows, NOW))
    expect(m.meta.map((x) => x.label)).toEqual(['Uppmätt', 'Aktualitet', 'Datakvalitet'])
  })

  it('a stale report (over 26 h) is flagged without any statement about scheduling', () => {
    const later = new Date('2026-10-13T08:00:00.000Z')
    const m = kpi(buildMarketplaceReport(rows, later, []))
    expect(m.meta.find((x) => x.label === 'Aktualitet')).toMatchObject({ tone: 'warning' })
    expect(m.notices[0].text).toBe('Rapporten är äldre än 26 tim och kan vara inaktuell.')
    expect(JSON.stringify(m)).not.toMatch(/schemalagd/i)
  })

  it('a failed collection with no report at all is stated next to "Ingen rapport ännu"', () => {
    const m = buildHandlarborsenOverview(buildMarketplaceReport([], NOW, [run('error', '2026-10-11T06:55:04.000Z', '2026-10-11')]))
    expect(m.kind).toBe('note')
    if (m.kind === 'note') expect(m.text).toMatch(/Inga värden visas\. Det senaste insamlingsförsöket misslyckades\./)
  })

  it('history text is built from real saved days and promises no chart', () => {
    const two = kpi(buildMarketplaceReport(rows, NOW, []))
    expect(two.historyText).not.toMatch(/diagram/i)
    expect(two.historyText).toMatch(/2 rapporter sparade/)
    const one = kpi(buildMarketplaceReport([rows[0]], NOW, []))
    expect(one.historyText).toMatch(/bara en rapport/)
  })

  it('renders without any scheduling claim, chart or arrow', () => {
    const out = html(buildMarketplaceReport(rows, new Date('2026-10-13T08:00:00.000Z'), []))
    expect(out).not.toMatch(/schemalagd|<svg|<canvas|[↑↓▲▼]/i)
  })
})

describe('report page: collection facts and saved-day history', () => {
  const rows = [
    snapshot('2026-10-11', '2026-10-11T06:55:00.000Z', { completeness: 'partial', bids_total: null, unavailable: { bids_total: 'query_failed' } }, 10),
    snapshot('2026-10-10', '2026-10-10T06:55:00.000Z', {}, 5),
  ]
  const html = (report: ReturnType<typeof buildMarketplaceReport>) =>
    renderToStaticMarkup(createElement(HandlarborsenMarketplaceReport, { slug: 'handlarborsen', name: 'Handlarbörsen', report }))

  it('lists each saved day with its quality; unavailable stays "okänt" and no 24 h figure is lined up', () => {
    const out = html(buildMarketplaceReport(rows, NOW, [run('ok', '2026-10-11T06:55:03.000Z', '2026-10-11', 'inserted')]))
    expect(out).toContain('2026-10-11')
    expect(out).toContain('2026-10-10')
    expect(out).toContain('Ofullständig')
    expect(out).toContain('Bud totalt okänt')
    expect(out).toContain('Senaste lyckade insamling')
    expect(out).toContain('Rapport sparad')
    expect(out).not.toMatch(/schemalagd/i)
    const historyPart = out.slice(out.indexOf('Sparade rapporter'))
    expect(historyPart).not.toContain('senaste 24 h')
  })

  it('shows no history list for a single saved day', () => {
    const out = html(buildMarketplaceReport([rows[1]], NOW, []))
    expect(out).not.toContain('Sparade rapporter, senaste först')
    expect(out).toContain('bara en rapport')
  })

  it("says a failed attempt happened, and that the figures come from the last saved report", () => {
    const out = html(buildMarketplaceReport(rows, NOW, [run('error', '2026-10-11T06:55:04.000Z', '2026-10-11')]))
    expect(out).toContain('Insamlingen misslyckades')
    expect(out).toContain('senast sparade rapporten')
  })

  it('a stale report says so plainly, without claiming anything about scheduling', () => {
    const out = html(buildMarketplaceReport(rows, new Date('2026-10-14T08:00:00.000Z'), []))
    expect(out).toContain('Rapporten är äldre än 26 tim och kan vara inaktuell.')
    expect(out).not.toMatch(/schemalagd/i)
  })
})

describe('Atlas fact block', () => {
  const rows = [snapshot('2026-10-11', '2026-10-11T06:55:00.000Z', {}, 10)]
  it('tells Atlas when the newest attempt failed, so a stale number is not presented as fresh', () => {
    const text = renderHandlarborsenFactBlock(buildMarketplaceReport(rows, NOW, [run('error', '2026-10-11T07:55:00.000Z', '2026-10-11')]))!
    expect(text).toContain('senaste insamlingsförsöket misslyckades')
  })
  it('adds nothing about collection when the attempt succeeded or the status is unknown', () => {
    expect(renderHandlarborsenFactBlock(buildMarketplaceReport(rows, NOW, [run('ok', '2026-10-11T06:55:03.000Z', '2026-10-11', 'inserted')]))).not.toContain('insamlingsförsöket')
    expect(renderHandlarborsenFactBlock(buildMarketplaceReport(rows, NOW))).not.toContain('insamlingsförsöket')
  })
})

describe('reader: collector_runs', () => {
  const project = { id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen' }
  function db(runs: { rows?: unknown[]; error?: unknown; throws?: boolean }) {
    const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = []
    return {
      calls,
      from(table: string) {
        const rec = { table, ops: [] as Array<[string, unknown[]]> }
        calls.push(rec)
        const b: any = {
          select: (...a: unknown[]) => { rec.ops.push(['select', a]); return b },
          eq: (...a: unknown[]) => { rec.ops.push(['eq', a]); return b },
          order: (...a: unknown[]) => { rec.ops.push(['order', a]); return b },
          limit: async (...a: unknown[]) => {
            rec.ops.push(['limit', a])
            if (table === 'collector_runs') {
              if (runs.throws) throw new Error('boom')
              return { data: runs.rows ?? [], error: runs.error ?? null }
            }
            return { data: [snapshot('2026-10-11', '2026-10-11T06:55:00.000Z')], error: null }
          },
          maybeSingle: async () => ({ data: { id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen', atlas_mode: 'observer' }, error: null }),
        }
        return b
      },
    }
  }
  const load = (d: ReturnType<typeof db>) =>
    loadHandlarborsenMarketplaceReport(project, { allowedProjectIds: [project.id] }, { db: d, now: NOW })

  it('reads only this collector and this project, newest first, named columns only', async () => {
    const d = db({ rows: [run('ok', '2026-10-11T06:55:03.000Z', '2026-10-11', 'inserted')] })
    const result = await load(d)
    const q = d.calls.find((c) => c.table === 'collector_runs')!
    expect(q.ops).toEqual(expect.arrayContaining([
      ['select', [COLLECTION_RUN_SELECT]],
      ['eq', ['collector_id', COLLECTOR_ID]],
      ['eq', ['project_id', HANDLARBORSEN_PROJECT_ID]],
      ['order', ['ran_at', { ascending: false }]],
    ]))
    expect(COLLECTION_RUN_SELECT).not.toMatch(/\*|^metadata|, metadata/) // never the whole payload
    expect(result.status === 'ok' && result.report.collection?.today).toBe('stored')
  })

  it('a failed audit read leaves the report intact and the collection unknown (null)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const d of [db({ error: { message: 'secret db text' } }), db({ throws: true })]) {
      const result = await load(d)
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.report.state).toBe('ok')
        expect(result.report.collection).toBeNull()
      }
    }
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)
    expect(logged).not.toContain('secret db text')
    vi.restoreAllMocks()
  })
})

describe('heartbeat registration', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/media/cron/heartbeat/route.ts'), 'utf8')
  it('monitors the one job as a daily 06:55 check with snapshot evidence', () => {
    const line = src.split('\n').find((l) => l.includes("key: 'handlarborsen_marketplace'"))!
    expect(line).toContain("jobs: ['omnira_handlarborsen_marketplace']")
    expect(line).toContain("type: 'daily'")
    expect(line).toContain("slotsUtc: ['06:55']")
    expect(line).toContain("evidence: 'hb_snapshot'")
    expect(src.match(/key: 'handlarborsen_marketplace'/g)).toHaveLength(1)
  })
  it('leaves every other check as it was', () => {
    for (const key of ['runs_drain', 'runs_reaper', 'workflow_tick', 'pipeline_retry', 'news', 'token_health', 'publish', 'youtube', 'refresh_tokens', 'stripe_revenue', 'social_account']) {
      expect(src).toContain(`key: '${key}'`)
    }
  })
})

describe('cron activation SQL (not a migration)', () => {
  const dir = resolve(process.cwd(), '../../docs/handlarborsen-p1e')
  const read = (f: string) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n')
  const activate = read('activate-cron.sql')
  const rollback = read('rollback-cron.sql')
  const strip = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')

  it('is NOT in any migration directory, and no migration schedules the route', () => {
    for (const d of ['supabase/migrations', '../../supabase/migrations']) {
      const root = resolve(process.cwd(), d)
      for (const f of readdirSync(root)) {
        const text = readFileSync(join(root, f), 'utf8')
        expect(text, f).not.toMatch(/omnira_handlarborsen_marketplace/)
        if (!f.includes('20260623_150300')) expect(text, f).not.toMatch(/cron\.schedule[^;]*handlarborsen/i)
      }
    }
  })

  it('schedules exactly one job: 06:55 UTC daily through call_vercel, nothing else', () => {
    const code = strip(activate)
    expect(code.match(/cron\.schedule\(/g)).toHaveLength(1)
    expect(code).toContain("c_job      constant text := 'omnira_handlarborsen_marketplace'")
    expect(code).toContain("c_schedule constant text := '55 6 * * *'")
    expect(code).toContain("select omnira_cron.call_vercel(''/api/collectors/handlarborsen/marketplace'')")
    expect(code).not.toMatch(/net\.http|http_get|Authorization|CRON_SECRET|cron_secret|vercel\.app|https?:\/\//i)
    expect(code).not.toMatch(/ensure_core_schedules|cron_heartbeat|cron\.unschedule|cron\.alter_job|UPDATE cron|DELETE FROM cron/i)
  })

  it('refuses to run without the guarded store, the closed write path, observer/active mode, or when a duplicate exists', () => {
    const code = strip(activate)
    expect(code).toContain("to_regprocedure('public.handlarborsen_store_marketplace_snapshot(date, timestamptz, jsonb, jsonb)') IS NULL")
    expect(code).toMatch(/has_table_privilege\('service_role', 'public\.handlarborsen_marketplace_snapshots', 'INSERT'\)/)
    expect(code).toMatch(/has_table_privilege\('service_role', 'public\.handlarborsen_marketplace_snapshots', 'UPDATE'\)/)
    expect(code).toContain("atlas_mode IN ('observer', 'active')")
    expect(code).toMatch(/jobname IS DISTINCT FROM c_job/)
    expect(code).toMatch(/expected exactly 1 Handlarborsen collector job/)
    expect(code).toMatch(/^BEGIN;$/m)
    expect(code).toMatch(/^COMMIT;$/m)
  })

  it('rollback unschedules only that one job and touches no data', () => {
    const code = strip(rollback)
    expect(code.match(/cron\.unschedule\(/g)).toHaveLength(1)
    expect(code).toContain("cron.unschedule('omnira_handlarborsen_marketplace')")
    expect(code).not.toMatch(/\b(DELETE|TRUNCATE|DROP|UPDATE)\b/i)
  })
})

describe('P1E leaves the other collectors alone', () => {
  it('stripe and social collectors, the registry and their routes are unmodified in behaviour', () => {
    const registry = readFileSync(join(process.cwd(), 'lib/atlas/collectors/registry.ts'), 'utf8')
    expect(registry.split('\n').filter((l) => l.startsWith('register(new '))).toHaveLength(3)
    for (const f of ['stripe-revenue.ts', 'social-account.ts']) {
      const text = readFileSync(join(process.cwd(), 'lib/atlas/collectors', f), 'utf8')
      expect(text).not.toMatch(/StoreDeclined|declined/)
    }
  })
})
