import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  enabled: vi.fn(() => false),
  save: vi.fn(async (): Promise<any> => ({ status: 'saved', count: 1 })),
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-competitor-memory-service', () => ({
  candidateMemoryEnabled: mocked.enabled,
  saveReviewedCandidateLead: mocked.save,
}))
import { POST, maxDuration } from '@/app/api/projects/[slug]/competitors/candidates/route'

const path = 'https://omniraos.se/api/projects/handlarborsen/competitors/candidates'
const invoke = (
  target = path,
  headers: Record<string, string> = { origin: 'https://omniraos.se', host: 'omniraos.se' },
  slug = 'handlarborsen',
) => POST(new Request(target, { method: 'POST', headers }), { params: { slug } })

beforeEach(() => {
  mocked.enabled.mockReturnValue(false)
  mocked.save.mockReset()
  mocked.save.mockResolvedValue({ status: 'saved', count: 1 })
})

describe('owner-gated immutable candidate memory POST', () => {
  it('does not execute when the DB release flag is off', async () => {
    expect((await invoke()).status).toBe(409)
    expect(mocked.save).not.toHaveBeenCalled()
    expect(maxDuration).toBeLessThanOrEqual(15)
  })
  it('rejects foreign slug, missing origin, forged origin and client-provided URLs', async () => {
    mocked.enabled.mockReturnValue(true)
    expect((await invoke(path, { origin: 'https://omniraos.se', host: 'omniraos.se' }, 'foreign')).status).toBe(404)
    expect((await invoke(path, { host: 'omniraos.se' })).status).toBe(403)
    expect((await invoke(path, { origin: 'https://attacker.test', host: 'omniraos.se' })).status).toBe(403)
    expect((await invoke(path + '?url=https://untrusted.test/')).status).toBe(400)
    expect((await invoke(path, { origin: 'https://omniraos.se', host: 'omniraos.se', 'content-type': 'application/json' })).status).toBe(400)
    expect(mocked.save).not.toHaveBeenCalled()
  })
  it('returns the real saved count and no-store headers', async () => {
    mocked.enabled.mockReturnValue(true)
    const res = await invoke()
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ status: 'saved', count: 1 })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
  it('propagates only fixed, safe statuses and never exposes DB errors', async () => {
    mocked.enabled.mockReturnValue(true)
    for (const [status, http] of [
      ['unauthorized', 401], ['forbidden', 403], ['invalid', 422],
      ['disabled', 409], ['unavailable', 503], ['already_recorded', 200],
    ] as const) {
      mocked.save.mockResolvedValueOnce({ status })
      expect((await invoke()).status).toBe(http)
    }
  })
})
