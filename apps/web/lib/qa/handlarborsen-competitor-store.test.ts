import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'

const { project, admin, scanner } = vi.hoisted(() => ({ project: vi.fn(), admin: vi.fn(), scanner: vi.fn() }))
vi.mock('@/lib/project/get-project', () => ({ getProjectBySlug: project }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: admin }))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitors-scan', () => ({ scanPublicSources: scanner }))
import { loadCompetitorHistory, saveManualCompetitorScan } from '@/lib/atlas/project-analytics/handlarborsen-competitor-store'
import { HANDLARBORSEN_PROJECT_ID } from '@/lib/atlas/collectors/handlarborsen-marketplace'
import { EVIDENCE } from '@/lib/atlas/project-analytics/handlarborsen-competitors'

const authorized = { id: HANDLARBORSEN_PROJECT_ID, slug: 'handlarborsen', name: 'Handlarbörsen' }
function database() {
  const rows: any[] = []
  const query: any = {}
  for (const method of ['select', 'eq', 'gte', 'lte', 'order']) query[method] = vi.fn(() => query)
  query.limit = vi.fn(async () => ({ data: rows.slice(), error: null }))
  query.upsert = vi.fn(async (inserts: any[], options: any) => {
    if (!options.ignoreDuplicates) throw new Error('overwrite forbidden')
    for (const row of inserts) {
      if (!rows.some(saved => saved.project_id === row.project_id && saved.source_id === row.source_id && saved.observed_on === row.observed_on)) rows.push(row)
    }
    return { error: null }
  })
  return { rows, query, from: vi.fn(() => query) }
}
let db: ReturnType<typeof database>
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-12T23:59:58Z'))
  project.mockResolvedValue(authorized)
  db = database()
  admin.mockReturnValue(db)
  scanner.mockResolvedValue({ checked_at: '2026-10-12T23:59:58Z', sources: EVIDENCE.map(source => ({
    id: source.id, checked_at: '2026-10-12T23:59:58.000Z', status: 'metadata_checked', title: 'Public title',
  })) })
})
afterEach(() => vi.useRealTimers())
describe('fixed project manual observation store', () => {
  it.each([null, { ...authorized, id: 'other' }, { ...authorized, slug: 'other' }, { ...authorized, name: 'Lookalike' }])(
    'denies read and write before admin or network for unauthorized identity', async identity => {
      project.mockResolvedValue(identity)
      expect(await loadCompetitorHistory()).toEqual({ status: 'not_permitted' })
      expect(await saveManualCompetitorScan()).toBe('not_permitted')
      expect(project).toHaveBeenCalledWith('handlarborsen')
      expect(admin).not.toHaveBeenCalled()
      expect(scanner).not.toHaveBeenCalled()
    },
  )
  it('reads only fixed project columns and at most 90 rows across 30 inclusive UTC dates', async () => {
    expect(await loadCompetitorHistory()).toEqual({ status: 'ok', observations: [] })
    expect(db.from).toHaveBeenCalledWith('handlarborsen_competitor_observations')
    expect(db.query.select).toHaveBeenCalledWith('source_id, observed_on, checked_at, status, title')
    expect(db.query.eq).toHaveBeenCalledWith('project_id', HANDLARBORSEN_PROJECT_ID)
    expect(db.query.gte).toHaveBeenCalledWith('observed_on', '2026-09-13')
    expect(db.query.lte).toHaveBeenCalledWith('observed_on', '2026-10-12')
    expect(db.query.limit).toHaveBeenCalledWith(90)
    expect(scanner).not.toHaveBeenCalled()
    expect(db.query.upsert).not.toHaveBeenCalled()
  })
  it.each(['error', 'throw', 'null'])('fails closed on unreadable DB (%s)', async failure => {
    if (failure === 'throw') db.query.limit.mockRejectedValue(new Error('private DB message'))
    else db.query.limit.mockResolvedValue({ data: failure === 'null' ? null : [], error: failure === 'error' ? {} : null })
    expect(await loadCompetitorHistory()).toEqual({ status: 'read_failed' })
    expect(await saveManualCompetitorScan()).toBe('read_failed')
    expect(scanner).not.toHaveBeenCalled()
    expect(db.query.upsert).not.toHaveBeenCalled()
  })
  it('stores max three normalized metadata rows; repeat today performs no network or overwrite', async () => {
    expect(await saveManualCompetitorScan()).toBe('saved')
    expect(db.rows).toHaveLength(3)
    expect(db.rows[0]).toEqual({ project_id: HANDLARBORSEN_PROJECT_ID, source_id: EVIDENCE[0].id,
      observed_on: '2026-10-12', checked_at: '2026-10-12T23:59:58.000Z', status: 'metadata_checked', title: 'Public title',
      title_digest: createHash('sha256').update('Public title').digest('hex') })
    expect(db.query.upsert).toHaveBeenCalledWith(expect.any(Array), {
      onConflict: 'project_id,source_id,observed_on', ignoreDuplicates: true,
    })
    expect(await saveManualCompetitorScan()).toBe('already_saved')
    expect(scanner).toHaveBeenCalledOnce()
    expect(db.query.upsert).toHaveBeenCalledOnce()
  })
  it('keeps first observation on conflict even with concurrent stale reads', async () => {
    db.query.limit.mockResolvedValue({ data: [], error: null })
    await saveManualCompetitorScan()
    scanner.mockResolvedValue({ checked_at: '2026-10-12T23:59:59Z', sources: EVIDENCE.map(source => ({
      id: source.id, status: 'metadata_checked', title: 'Later title', checked_at: '2026-10-12T23:59:59Z',
    })) })
    await saveManualCompetitorScan()
    expect(db.rows).toHaveLength(3)
    expect(db.rows.every(row => row.title === 'Public title')).toBe(true)
  })
  it('fills only missing sources and stores neither title nor digest on failure', async () => {
    db.rows.push({ project_id: HANDLARBORSEN_PROJECT_ID, source_id: EVIDENCE[0].id, observed_on: '2026-10-12' })
    scanner.mockResolvedValue({ checked_at: '2026-10-12T23:59:58Z', sources: EVIDENCE.map(source => ({
      id: source.id, status: 'robots_denied', title: null, checked_at: '2026-10-12T23:59:58Z',
    })) })
    await saveManualCompetitorScan()
    expect(db.query.upsert.mock.calls[0][0]).toHaveLength(2)
    expect(db.rows[1].title).toBeNull()
    expect(db.rows[1].title_digest).toBeNull()
  })
  it('keeps actual source check UTC dates when scanning crosses midnight', async () => {
    scanner.mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-10-13T00:00:01Z'))
      return { checked_at: '2026-10-13T00:00:01Z', sources: EVIDENCE.map(source => ({
        id: source.id, status: 'metadata_checked', title: 'Public title', checked_at: '2026-10-13T00:00:01Z',
      })) }
    })
    await saveManualCompetitorScan()
    expect(db.rows.every(row => row.observed_on === '2026-10-13' && row.checked_at.startsWith('2026-10-13'))).toBe(true)
  })
  it('does not claim persistence when insert fails or throws', async () => {
    db.query.upsert.mockResolvedValueOnce({ error: {} })
    expect(await saveManualCompetitorScan()).toBe('write_failed')
    db.query.upsert.mockRejectedValueOnce(new Error('private message'))
    expect(await saveManualCompetitorScan()).toBe('write_failed')
  })
})
