import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  enabled: vi.fn(() => false),
  decide: vi.fn(async (): Promise<any> => ({ status: 'saved', decidedStatus: 'interesting' })),
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-candidate-review-service', () => ({
  candidateReviewEnabled: mocked.enabled,
  decideCandidateReview: mocked.decide,
}))
import { POST, maxDuration } from '@/app/api/projects/[slug]/competitors/reviews/route'

const url = 'https://omniraos.se/api/projects/handlarborsen/competitors/reviews'
const data = { host: 'tradingsolutions.se', status: 'interesting',
  requestId: '33333333-3333-4333-8333-333333333333', expectedRevision: 0 }
const headers = { origin: 'https://omniraos.se', host: 'omniraos.se', 'content-type': 'application/json' }
const invoke = (payload: unknown = data, urlValue = url, h: Record<string,string> = headers, slug = 'handlarborsen') =>
  POST(new Request(urlValue, {
    method: 'POST', headers: h, body: JSON.stringify(payload),
  }), { params: { slug } })

beforeEach(() => {
  mocked.enabled.mockReset().mockReturnValue(false)
  mocked.decide.mockReset().mockResolvedValue({ status: 'saved', decidedStatus: 'interesting' })
})

describe('Manual Handlarbörsen human review decision endpoint', () => {
  it('remains off until both approved feature flags and the new schema exist', async () => {
    expect((await invoke()).status).toBe(409)
    expect(mocked.decide).not.toHaveBeenCalled()
    expect(maxDuration).toBeLessThanOrEqual(15)
  })
  it('rejects foreign project, origin forgery, JSON-free bodies and query strings before any write', async () => {
    mocked.enabled.mockReturnValue(true)
    expect((await invoke(data,url,headers,'family-stunden')).status).toBe(404)
    expect((await invoke(data,url,{ ...headers, origin: 'https://attacker.invalid' })).status).toBe(403)
    expect((await invoke(data,url,{ ...headers, 'content-type': 'text/plain' })).status).toBe(400)
    expect((await invoke(data,url+'?actor_id=forged')).status).toBe(400)
    expect((await invoke({ ...data, userId: 'forged' })).status).toBe(201)
    // The service, not this HTTP shape mock, rejects forbidden extra keys.
    expect(mocked.decide).toHaveBeenCalledTimes(1)
  })
  it('passes only parsed JSON body to the separately authenticated decision service', async () => {
    mocked.enabled.mockReturnValue(true)
    const res=await invoke()
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ status:'saved', decidedStatus:'interesting' })
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(mocked.decide).toHaveBeenCalledWith(data)
  })
  it('returns strictly mapped status codes on denials, replay and storage unavailable', async () => {
    mocked.enabled.mockReturnValue(true)
    for(const [status,http] of [
      ['unauthorized',401],['forbidden',403],['invalid',422],['not_found',404],
      ['conflict',409],['unavailable',503],['disabled',409],
      ['unchanged',200],['already_applied',200],
    ] as const) {
      mocked.decide.mockResolvedValueOnce({ status })
      expect((await invoke()).status).toBe(http)
    }
  })
})
