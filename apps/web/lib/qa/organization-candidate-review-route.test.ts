import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  decide: vi.fn(async (): Promise<any> => ({ status: 'saved', decidedStatus: 'reviewed' })),
  access: vi.fn(async (): Promise<any> => ({ ok: true, db: {} })),
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-candidate-review-service', () => ({
  candidateReviewEnabled: mocks.enabled,
  decideCandidateReview: mocks.decide,
}))
vi.mock('@/lib/auth/organization-competitor-access', () => ({
  authorizeOrganizationCompetitorAction: mocks.access,
}))
import { POST, maxDuration } from '@/app/api/organization/projects/[slug]/competitors/reviews/route'

const url = 'https://omniraos.se/api/organization/projects/handlarborsen/competitors/reviews'
const headers = { origin: 'https://omniraos.se', host: 'omniraos.se', 'content-type': 'application/json' }
const body = { host: 'tradingsolutions.se', status: 'reviewed',
  requestId: '33333333-3333-4333-8333-333333333333', expectedRevision: 0 }
const invoke = (payload: unknown = body, target = url, extra: Record<string, string> = {}, slug = 'handlarborsen') =>
  POST(new Request(target, { method: 'POST', headers: { ...headers, ...extra },
    body: JSON.stringify(payload) }), { params: { slug } })

beforeEach(() => {
  mocks.enabled.mockReset().mockReturnValue(true)
  mocks.decide.mockReset().mockResolvedValue({ status: 'saved', decidedStatus: 'reviewed' })
  mocks.access.mockReset().mockResolvedValue({ ok: true, db: {} })
})
describe('Handlarbörsen collaborator review POST – independently gated', () => {
  it('is disabled before accessing session or storage when feature flag is off', async () => {
    mocks.enabled.mockReturnValue(false)
    expect((await invoke()).status).toBe(409)
    expect(mocks.access).not.toHaveBeenCalled()
    expect(mocks.decide).not.toHaveBeenCalled()
    expect(maxDuration).toBeLessThanOrEqual(15)
  })
  it('rejects other projects, CSRF and unapproved query/body envelopes before any DB operation', async () => {
    expect((await invoke(body,url,{},'familje-stunden')).status).toBe(404)
    expect((await invoke(body,url,{ origin: 'https://evil.test' })).status).toBe(403)
    expect((await invoke(body,url,{ 'content-type': 'text/plain' })).status).toBe(400)
    expect((await invoke(body,url+'?source=other')).status).toBe(400)
    expect(mocks.access).not.toHaveBeenCalled()
    expect(mocks.decide).not.toHaveBeenCalled()
  })
  it('requires a fresh collaborator-specific action grant before the review transaction', async () => {
    for (const [reason, code] of [
      ['unauthorized',401],['forbidden',403],['unavailable',503],
    ] as const) {
      mocks.access.mockResolvedValueOnce({ ok: false, status: reason })
      expect((await invoke()).status).toBe(code)
    }
    expect(mocks.access).toHaveBeenCalledWith('record_competitor_evidence')
    expect(mocks.decide).not.toHaveBeenCalled()
  })
  it('permits a scoped real manual decision only after authorization', async () => {
    const r=await invoke()
    expect(r.status).toBe(201)
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect(await r.json()).toEqual({ status: 'saved', decidedStatus: 'reviewed' })
    expect(mocks.access).toHaveBeenCalledOnce()
    expect(mocks.decide).toHaveBeenCalledOnce()
    expect(mocks.decide).toHaveBeenCalledWith(body)
  })
  it('propagates duplicate replay, conflict and invalid statuses without fake success', async () => {
    for (const [status,http] of [
      ['already_applied',200],['unchanged',200],['conflict',409],
      ['forbidden',403],['invalid',422],['unavailable',503],
    ] as const) {
      mocks.decide.mockResolvedValueOnce({ status, decidedStatus: 'reviewed' })
      expect((await invoke()).status).toBe(http)
    }
  })
})
