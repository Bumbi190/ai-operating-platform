/** Provider-free contract for the latency-sensitive verified session path. */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const getClaims = vi.fn()
const getUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getClaims, getUser } }),
}))

import { requireUserClaims } from '@/lib/auth/session'

describe('requireUserClaims', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getClaims.mockResolvedValue({
      data: { claims: { sub: 'user-1', email: 'owner@example.com' } },
      error: null,
    })
  })

  it('returns only identity fields from verified claims', async () => {
    await expect(requireUserClaims()).resolves.toEqual({
      ok: true,
      userId: 'user-1',
      email: 'owner@example.com',
    })
    expect(getClaims).toHaveBeenCalledOnce()
    expect(getUser).not.toHaveBeenCalled()
  })

  it.each([
    ['missing session', { data: null, error: null }],
    ['missing subject', { data: { claims: { email: 'owner@example.com' } }, error: null }],
    ['verification error', { data: null, error: new Error('invalid jwt') }],
  ])('fails closed on %s', async (_label, result) => {
    getClaims.mockResolvedValue(result)
    const auth = await requireUserClaims()
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect(auth.response.status).toBe(401)
  })

  it('fails closed when verification throws', async () => {
    getClaims.mockRejectedValue(new Error('auth unavailable'))
    const auth = await requireUserClaims()
    expect(auth.ok).toBe(false)
    if (!auth.ok) expect(auth.response.status).toBe(401)
  })
})
