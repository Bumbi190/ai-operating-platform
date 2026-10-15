import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createCompetitorHistoryService,
  type HistoryDependencies,
} from '@/lib/atlas/project-analytics/handlarborsen-competitor-history-service'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'

vi.mock('@/lib/project/get-project', () => ({ getProjectBySlug: vi.fn() }))
vi.mock('@/lib/auth/project-access', () => ({ resolveProjectAccess: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
import { EVIDENCE } from '@/lib/atlas/project-analytics/handlarborsen-competitors'
import { COMPETITOR_SITES } from '@/lib/atlas/project-analytics/handlarborsen-competitor-landscape'

const clock = new Date('2026-10-14T16:00:00.000Z')
const project = {
  id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen', name: 'Handlarbörsen',
  color: '#2563eb', settings: {}, executionPaused: false,
  pausedAt: null, pausedReason: null,
}
const actor = '8c6af048-7b13-4281-a11f-03bb4d123456'

function harness(saved: any[] = [], enabled = true) {
  const read = vi.fn(async (): Promise<{data: any[] | null; error: any}> => ({ data: saved, error: null }))
  const upsert = vi.fn((payload: any[], _options: any) => ({
    select: vi.fn(async () => ({ data: payload.map(row => ({ source_id: row.source_id })), error: null })),
  }))
  const from = vi.fn((table: string) => {
    if (table === 'projects') return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: { id: project.id, slug: project.slug, owner_id: actor }, error: null,
      }) }) }),
    }
    if (table === 'handlarborsen_competitor_observations') return {
      select: () => ({
        eq: () => ({
          gte: () => ({ lte: () => ({
            order: () => ({ order: () => ({ limit: read }) }),
          }) }),
        }),
      }),
      upsert,
    }
    throw new Error('Unrecognized table: ' + table)
  })
  const db = { from }
  const publicScan = vi.fn(async () => ({
    checked_at: clock.toISOString(),
    sources: EVIDENCE.map(x => ({
      id: x.id, status: 'metadata_checked' as const,
      title: 'Verified ' + x.id, checked_at: clock.toISOString(),
    })),
  }))
  const landscapeScan = vi.fn(async () => ({
    checkedAt: clock.toISOString(),
    observations: COMPETITOR_SITES.map(x => ({
      id: x.id, status: x.id === 'bca' ? 'robots_unavailable' as const : 'metadata_checked' as const,
      title: x.id === 'bca' ? null : 'Verified ' + x.id, checkedAt: clock.toISOString(),
    })),
  }))
  const access = vi.fn(async () => ({
    ok: true as const, userId: actor, allowedProjectIds: [project.id],
  }))
  const lookup = vi.fn(async () => project)
  const deps = {
    access, project: lookup, db: () => db, publicScan, landscapeScan,
    clock: vi.fn(() => clock),
    env: { HANDLARBORSEN_COMPETITOR_HISTORY_ENABLED: enabled ? 'true' : 'false' },
  } as unknown as HistoryDependencies
  return { service: createCompetitorHistoryService(deps), deps, from, read, upsert, access, lookup, publicScan, landscapeScan }
}

function stored(title = 'Saved source') {
  return {
    project_id: project.id, source_id: 'auto1', observed_on: '2026-10-14',
    checked_at: '2026-10-14T10:00:00.000Z', status: 'metadata_checked', title,
    title_digest: createHash('sha256').update(title).digest('hex'),
  }
}

describe('gated immutable competitor observation storage', () => {
  it('fails closed before session, project, DB or external HTTP when flag disabled', async () => {
    const h = harness([], false)
    expect(await h.service.load()).toEqual({ status: 'disabled' })
    expect(await h.service.save()).toEqual({ status: 'disabled' })
    expect(h.access).not.toHaveBeenCalled()
    expect(h.from).not.toHaveBeenCalled()
    expect(h.publicScan).not.toHaveBeenCalled()
  })
  it('denies a user who does not own Handlarbörsen before database I/O and scanning', async () => {
    const h = harness()
    h.access.mockResolvedValueOnce({ ok: true, userId: actor, allowedProjectIds: [] })
    expect(await h.service.save()).toEqual({ status: 'forbidden' })
    expect(h.from).not.toHaveBeenCalled()
    expect(h.publicScan).not.toHaveBeenCalled()
  })
  it('rejects an owner mismatch from live projects before any competitor fetch', async () => {
    const h = harness()
    h.access.mockResolvedValueOnce({ ok: true, userId: 'different', allowedProjectIds: [project.id] })
    expect(await h.service.save()).toEqual({ status: 'forbidden' })
    expect(h.publicScan).not.toHaveBeenCalled()
  })
  it('denies missing sessions and even collaborators who can view the project but are not its owner', async () => {
    const missing = harness()
    missing.access.mockResolvedValueOnce({ ok: false, response: { status: 401 } } as any)
    expect(await missing.service.save()).toEqual({ status: 'unauthorized' })
    expect(missing.from).not.toHaveBeenCalled()
    expect(missing.publicScan).not.toHaveBeenCalled()
    const viewer = harness()
    viewer.access.mockResolvedValueOnce({ ok: true, userId: 'read-only-viewer', allowedProjectIds: [project.id] })
    expect(await viewer.service.save()).toEqual({ status: 'forbidden' })
    expect(viewer.publicScan).not.toHaveBeenCalled()
    expect(viewer.upsert).not.toHaveBeenCalled()
  })
  it('reads only verified immutable same-project records and creates truthful daily chart', async () => {
    const h = harness([stored()])
    const result = await h.service.load()
    expect(result.status).toBe('ok')
    if (result.status === 'ok' && result.history.status === 'ok') {
      expect(result.history.observedDays).toBe(1)
      expect(result.history.proposals).toHaveLength(0)
      expect(result.history.daily[0].comparablePairs).toBe(0)
    }
    expect(h.from).toHaveBeenCalledWith('handlarborsen_competitor_observations')
    expect(h.publicScan).not.toHaveBeenCalled()
  })
  it('normalizes PostgREST UTC offsets for stored timestamptz values', async () => {
    const h = harness([{ ...stored(), checked_at: '2026-10-14T10:00:00+00:00' }])
    const result = await h.service.load()
    expect(result.status).toBe('ok')
    if (result.status === 'ok' && result.history.status === 'ok') {
      expect(result.history.observations[0].checkedAt).toBe('2026-10-14T10:00:00.000Z')
    }
  })
  it('rejects corrupted digest, wrong project or malformed history without rendering', async () => {
    for (const row of [{ ...stored(), title_digest: '0'.repeat(64) }, { ...stored(), project_id: 'other' }]) {
      const h = harness([row])
      expect(await h.service.load()).toEqual({ status: 'invalid' })
    }
  })
  it('does not rescan or overwrite when all six same-day observations are already saved', async () => {
    const today = [...EVIDENCE.map(x => x.id), ...COMPETITOR_SITES.map(x => x.id)]
      .map(source_id => ({ ...stored(), source_id }))
    const h = harness(today)
    expect(await h.service.save()).toEqual({ status: 'already_saved', count: 6 })
    expect(h.publicScan).not.toHaveBeenCalled()
    expect(h.landscapeScan).not.toHaveBeenCalled()
    expect(h.upsert).not.toHaveBeenCalled()
  })
  it('fails closed on incomplete six-source day, rather than presenting it as fully saved', async () => {
    const h = harness([stored()])
    expect(await h.service.save()).toEqual({ status: 'invalid' })
    expect(h.publicScan).not.toHaveBeenCalled()
    expect(h.upsert).not.toHaveBeenCalled()
  })
  it('refuses a batch if UTC midnight passes between authorization and scan completion', async () => {
    const h = harness()
    const mockedClock = vi.mocked(h.deps.clock)
    mockedClock.mockReturnValueOnce(new Date('2026-10-14T23:59:59.000Z'))
    mockedClock.mockReturnValueOnce(new Date('2026-10-15T00:00:01.000Z'))
    expect(await h.service.save()).toEqual({ status: 'invalid' })
    expect(h.upsert).not.toHaveBeenCalled()
  })
  it('does not claim records saved if another concurrent INSERT wins unique-day conflicts', async () => {
    const h = harness()
    h.upsert.mockImplementationOnce(() => ({
      select: vi.fn(async () => ({ data: [], error: null })),
    }))
    expect(await h.service.save()).toEqual({ status: 'already_saved', count: 0 })
  })
  it('stores only six fixed source IDs, one per day, using DO NOTHING semantics', async () => {
    const h = harness()
    expect(await h.service.save()).toEqual({ status: 'saved', count: 6 })
    expect(h.publicScan).toHaveBeenCalledOnce()
    expect(h.landscapeScan).toHaveBeenCalledOnce()
    expect(h.upsert).toHaveBeenCalledOnce()
    const [rows, options] = h.upsert.mock.calls[0] as unknown as [any[], Record<string, unknown>]
    expect(rows).toHaveLength(6)
    expect(new Set(rows.map(x => x.source_id)).size).toBe(6)
    expect(rows.every(x => x.project_id === project.id && x.observed_on === '2026-10-14')).toBe(true)
    expect(rows.find(x => x.source_id === 'bca')).toMatchObject({
      title: null, title_digest: null, status: 'robots_unavailable',
    })
    expect(rows.every(x => x.title === null || x.title_digest === createHash('sha256').update(x.title).digest('hex'))).toBe(true)
    expect(options).toEqual({
      onConflict: 'project_id,source_id,observed_on', ignoreDuplicates: true,
    })
  })
  it('rejects partially inserted concurrent batches instead of claiming a completed day', async () => {
    const h = harness()
    h.upsert.mockImplementationOnce(() => ({
      select: vi.fn(async () => ({ data: [{ source_id: 'auto1' }], error: null })),
    }))
    expect(await h.service.save()).toEqual({ status: 'invalid' })
  })
  it('rejects unsafe remote titles and logs only harmless shape metadata in preview', async () => {
    const h = harness()
    h.deps.env.VERCEL_ENV = 'preview'
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const unsafeTitle = 'UNSAFE_SENTINEL<>'
    h.publicScan.mockResolvedValueOnce({
      checked_at: clock.toISOString(),
      sources: EVIDENCE.map((x, i) => ({
        id: x.id,
        status: 'metadata_checked' as const,
        title: i === 0 ? unsafeTitle : 'Verified ' + x.id,
        checked_at: clock.toISOString(),
      })),
    })
    try {
      expect(await h.service.save()).toEqual({ status: 'invalid' })
      expect(h.upsert).not.toHaveBeenCalled()
      expect(warning).toHaveBeenCalledWith(
        '[hb-history-smoke] candidate validation failed',
        'invalid_observation',
        expect.any(Array),
      )
      expect(JSON.stringify(warning.mock.calls)).not.toContain(unsafeTitle)
    } finally {
      warning.mockRestore()
    }
  })

  it('fails closed without scanning when storage is unavailable', async () => {
    const h = harness()
    h.read.mockResolvedValueOnce({ data: null, error: { message: 'table missing' } })
    expect(await h.service.save()).toEqual({ status: 'unavailable' })
    expect(h.publicScan).not.toHaveBeenCalled()
  })
})
