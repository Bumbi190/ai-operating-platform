/** Deterministic proof that cache warmup overlaps reads and grants no spend. */

import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const getRates = vi.fn()
const maybeSingle = vi.fn()
const reserveSpend = vi.fn()

vi.mock('@/lib/cost/rates', () => ({ getRates }))
vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend,
  settleSpend: vi.fn(),
  releaseSpend: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          limit: () => ({ maybeSingle }),
        }),
      }),
    }),
  }),
}))

describe('warmGovernanceReadCaches', () => {
  it('starts rate and project reads together without reserving or dispatching', async () => {
    let releaseRates!: () => void
    let releaseProject!: () => void
    getRates.mockImplementation(() => new Promise<void>(resolve => { releaseRates = resolve }))
    maybeSingle.mockImplementation(() => new Promise(resolve => {
      releaseProject = () => resolve({ data: { id: 'project-1' }, error: null })
    }))

    const { warmGovernanceReadCaches } = await import('@/lib/cost/governed-spend')
    const warming = warmGovernanceReadCaches({ projectSlug: 'phase-b2-fixture' })
    await Promise.resolve()
    await Promise.resolve()

    expect(getRates).toHaveBeenCalledOnce()
    expect(maybeSingle).toHaveBeenCalledOnce()
    expect(reserveSpend).not.toHaveBeenCalled()

    releaseRates()
    releaseProject()
    await warming
  })
})
