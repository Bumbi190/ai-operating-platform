import { describe, expect, it } from 'vitest'
import { compareTitleHistory, type CompetitorObservation } from '@/lib/atlas/project-analytics/handlarborsen-competitor-history'
import { EVIDENCE, STATUS_LABELS, type SourceStatus } from '@/lib/atlas/project-analytics/handlarborsen-competitors'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const row = (day: string, title: string | null, status: SourceStatus = 'metadata_checked'): CompetitorObservation => ({
  source_id: EVIDENCE[0].id, observed_on: day, checked_at: `${day}T12:00:00Z`, status, title,
})
describe('conservative title history', () => {
  it('reports only different successful titles with source and dated evidence', () => {
    expect(compareTitleHistory([row('2026-10-12', 'New'), row('2026-10-11', 'Old')]))
      .toEqual([{ source_id: EVIDENCE[0].id, from: '2026-10-11', to: '2026-10-12' }])
  })
  it.each(Object.keys(STATUS_LABELS).filter(status => status !== 'metadata_checked') as SourceStatus[])(
    'never infers a change across %s', status => {
      expect(compareTitleHistory([row('2026-10-10', 'Old'), row('2026-10-11', null, status), row('2026-10-12', 'New')])).toEqual([])
      expect(compareTitleHistory([row('2026-10-11', null, status), row('2026-10-12', 'New')])).toEqual([])
    },
  )
  it('does not fabricate change for empty, single, identical, missing or different-source data', () => {
    for (const rows of [[], [row('2026-10-11', 'Old')], [row('2026-10-11', 'Old'), row('2026-10-12', 'Old')],
      [row('2026-10-11', null), row('2026-10-12', 'New')],
      [row('2026-10-11', 'Old'), { ...row('2026-10-12', 'New'), source_id: EVIDENCE[1].id }]]) {
      expect(compareTitleHistory(rows)).toEqual([])
    }
  })
})
describe('unapplied schema access contract (static; live DB checks remain a migration gate)', () => {
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261012100000_handlarborsen_competitor_observations.sql'), 'utf8')
  it('pins project/source/day, UTC, digest and P1 statuses', () => {
    expect(sql).toMatch(/REFERENCES public.projects\(id\) ON DELETE CASCADE/)
    expect(sql).toContain('UNIQUE (project_id, source_id, observed_on)')
    expect(sql).toContain("AT TIME ZONE 'UTC'")
    expect(sql).toContain('varchar(160)')
    expect(sql).toContain("sha256(convert_to(title, 'UTF8'))")
    expect(sql).toContain('title IS NULL AND title_digest IS NULL')
    for (const source of EVIDENCE) expect(sql).toContain(`'${source.id}'`)
    for (const status of Object.keys(STATUS_LABELS)) expect(sql).toContain(`'${status}'`)
    expect(sql).toContain('(project_id, observed_on DESC)')
  })
  it('enables RLS with no policies, revokes all defaults and grants only SELECT/INSERT', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    for (const role of ['PUBLIC', 'anon', 'authenticated', 'service_role']) {
      expect(sql).toContain(`REVOKE ALL ON TABLE public.handlarborsen_competitor_observations FROM ${role};`)
    }
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE public.handlarborsen_competitor_observations TO service_role;')
    const statements = sql.replace(/^\s*--.*$/gm, '')
    expect(statements).not.toMatch(/CREATE POLICY|SECURITY DEFINER|CREATE (?:FUNCTION|TRIGGER)|cron\.|net\.|GRANT.*UPDATE/i)
  })
})
