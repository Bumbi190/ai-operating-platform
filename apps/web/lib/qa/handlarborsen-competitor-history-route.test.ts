import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocked = vi.hoisted(() => ({
  enabled: vi.fn(() => false),
  save: vi.fn(async (): Promise<any> => ({ status: 'saved', count: 6 })),
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-history-service', () => ({
  competitorHistoryEnabled: mocked.enabled,
  saveCompetitorHistory: mocked.save,
}))
import { POST, maxDuration } from '@/app/api/projects/[slug]/competitors/history/route'

const path = 'https://omniraos.se/api/projects/handlarborsen/competitors/history'
const invoke = (
  target = path,
  headers: Record<string, string> = { origin: 'https://omniraos.se', host: 'omniraos.se' },
  slug = 'handlarborsen',
) => POST(new Request(target, { method: 'POST', headers }), { params: { slug } })

beforeEach(() => {
  mocked.enabled.mockReturnValue(false)
  mocked.save.mockReset()
  mocked.save.mockResolvedValue({ status: 'saved', count: 6 })
})

describe('owner-only competitor history endpoint', () => {
  it('reserves enough time for bounded manual external checks', () => {
    expect(maxDuration).toBe(60)
  })
  it('is disabled by default, without calling the persistence service', async () => {
    const response = await invoke()
    expect(response.status).toBe(409)
    expect(mocked.save).not.toHaveBeenCalled()
  })
  it('rejects unknown project, missing/wrong origin and extra request data before storage', async () => {
    mocked.enabled.mockReturnValue(true)
    expect((await invoke(path, { origin: 'https://omniraos.se', host: 'omniraos.se' }, 'foreign')).status).toBe(404)
    expect((await invoke(path, { host: 'omniraos.se' })).status).toBe(403)
    expect((await invoke(path, { origin: 'https://other.example', host: 'omniraos.se' })).status).toBe(403)
    expect((await invoke(path + '?target=other', { origin: 'https://omniraos.se', host: 'omniraos.se' })).status).toBe(400)
    expect((await invoke(path, { origin: 'https://omniraos.se', host: 'omniraos.se', 'content-type': 'application/json' })).status).toBe(400)
    expect(mocked.save).not.toHaveBeenCalled()
  })
  it('returns recorded counts only after server-side service says saved', async () => {
    mocked.enabled.mockReturnValue(true)
    const response = await invoke()
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ status: 'saved', count: 6 })
    expect(mocked.save).toHaveBeenCalledOnce()
  })
  it('preserves fail-closed service result status', async () => {
    mocked.enabled.mockReturnValue(true)
    for (const [status, http] of [
      ['unauthorized', 401], ['forbidden', 403], ['unavailable', 503], ['invalid', 422],
      ['already_saved', 200],
    ] as const) {
      mocked.save.mockResolvedValueOnce({ status })
      const response = await invoke()
      expect(response.status).toBe(http)
    }
  })
})
