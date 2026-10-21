import { beforeEach, describe, expect, it, vi } from 'vitest'

const memory = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  save: vi.fn(async (): Promise<any> => ({ status: 'already_recorded', count: 0 })),
}))
const history = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  save: vi.fn(async (): Promise<any> => ({ status: 'already_saved', count: 6 })),
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service', () => ({
  candidateMemoryEnabled: memory.enabled,
  saveOrganizationReviewedCandidate: memory.save,
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-history-service', () => ({
  competitorHistoryEnabled: history.enabled,
  saveOrganizationCompetitorHistory: history.save,
}))
import { POST as saveCandidate } from '@/app/api/organization/projects/[slug]/competitors/candidates/route'
import { POST as saveHistory } from '@/app/api/organization/projects/[slug]/competitors/history/route'

const candidateUrl = 'https://omniraos.se/api/organization/projects/handlarborsen/competitors/candidates'
const historyUrl = 'https://omniraos.se/api/organization/projects/handlarborsen/competitors/history'
const trusted = { origin: 'https://omniraos.se', host: 'omniraos.se' }
type Route = typeof saveCandidate
const call = (post: Route, url: string, headers: Record<string, string> = trusted, slug = 'handlarborsen') =>
  post(new Request(url, { method: 'POST', headers }), { params: { slug } })

beforeEach(() => {
  memory.enabled.mockReturnValue(true)
  history.enabled.mockReturnValue(true)
  memory.save.mockReset().mockResolvedValue({ status: 'already_recorded', count: 0 })
  history.save.mockReset().mockResolvedValue({ status: 'already_saved', count: 6 })
})

describe('isolated collaborator competitor POST routes', () => {
  it('exposes no action when its corresponding feature flag is off', async () => {
    memory.enabled.mockReturnValue(false)
    history.enabled.mockReturnValue(false)
    expect((await call(saveCandidate, candidateUrl)).status).toBe(409)
    expect((await call(saveHistory, historyUrl)).status).toBe(409)
    expect(memory.save).not.toHaveBeenCalled()
    expect(history.save).not.toHaveBeenCalled()
  })
  it('rejects foreign slugs, CSRF, client-controlled URLs and request bodies before the delegated service', async () => {
    for (const [fn, url] of [[saveCandidate, candidateUrl], [saveHistory, historyUrl]] as const) {
      expect((await call(fn, url, trusted, 'foreign')).status).toBe(404)
      expect((await call(fn, url, { host: 'omniraos.se' })).status).toBe(403)
      expect((await call(fn, url, { origin: 'https://untrusted.example', host: 'omniraos.se' })).status).toBe(403)
      expect((await call(fn, url + '?url=https://untrusted.example/')).status).toBe(400)
      expect((await call(fn, url, { ...trusted, 'content-type': 'application/json' })).status).toBe(400)
    }
    expect(memory.save).not.toHaveBeenCalled()
    expect(history.save).not.toHaveBeenCalled()
  })
  it('returns an actual immutable duplicate, with no extra client payload or automatic retry', async () => {
    const a = await call(saveCandidate, candidateUrl)
    const b = await call(saveHistory, historyUrl)
    expect(a.status).toBe(200)
    expect(await a.json()).toEqual({ status: 'already_recorded', count: 0 })
    expect(b.status).toBe(200)
    expect(await b.json()).toEqual({ status: 'already_saved', count: 6 })
    expect(memory.save).toHaveBeenCalledTimes(1)
    expect(history.save).toHaveBeenCalledTimes(1)
    expect(a.headers.get('cache-control')).toContain('no-store')
    expect(b.headers.get('cache-control')).toContain('no-store')
  })
  it('never turns membership denials or storage errors into a successful write', async () => {
    for (const [status, http] of [
      ['unauthorized', 401], ['forbidden', 403], ['invalid', 422], ['unavailable', 503],
    ] as const) {
      memory.save.mockResolvedValueOnce({ status })
      history.save.mockResolvedValueOnce({ status })
      expect((await call(saveCandidate, candidateUrl)).status).toBe(http)
      expect((await call(saveHistory, historyUrl)).status).toBe(http)
    }
  })
})
