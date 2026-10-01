/**
 * G3C-3C-B PRE-1 — a replay refusal is DISPATCH SAFETY, never budget policy.
 *
 * `H1_SPEND_GATE` exists so a budget CEILING can roll out gradually: while it is
 * advisory, "over budget" becomes a warning and the call proceeds. The worst case
 * of that bargain is money.
 *
 * A replay refusal is a different sentence. It says this logical spend identity
 * has already been consumed, or may still be live on another worker. Downgrading
 * it returns `allowed: true` carrying THE OTHER CALLER'S reservation id — so the
 * second caller dispatches the provider again and then settles a row it does not
 * own. That worst case is not money, it is a duplicate external effect, which is
 * precisely what `budget_reserve`'s replay machine exists to prevent.
 *
 * These drive the REAL `reserveSpend` against a faked RPC, so the verdict shaping
 * under test is production's.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('server-only', () => ({}))

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) }))

/** One row shaped exactly as budget_reserve returns it. */
const row = (allowed: boolean, reason: string, id: string | null) => ({
  data: [{
    allowed, reservation_id: id, reason,
    budget_sek: 700, spent_sek: 0, held_sek: 0, headroom_sek: 700, binding_scope: 'project',
  }],
  error: null,
})

const REPLAY_REASONS = [
  'replay_in_flight', 'replay_stale', 'replay_settled',
  'replay_released', 'replay_identity_mismatch',
] as const

beforeEach(() => { rpc.mockReset(); vi.resetModules() })
afterEach(() => { delete process.env.H1_SPEND_GATE })

describe('R16/R17 · advisory mode downgrades budget policy, never dispatch safety', () => {
  for (const reason of REPLAY_REASONS) {
    it(`R16 — H1 OFF + ${reason} stays REFUSED`, async () => {
      delete process.env.H1_SPEND_GATE           // advisory
      rpc.mockResolvedValue(row(false, reason, 'res-first-caller'))
      const { reserveSpend } = await import('@/lib/cost/budget-gate')
      const v = await reserveSpend({ projectId: 'p', estimatedSek: 3, idempotencyKey: 'k' })

      expect(v.allowed, `${reason} must not be advisory-overridden`).toBe(false)
      expect(v.advisoryOverride, 'and must not be reported as an override').toBe(false)
      expect(v.reason).toBe(reason)
    })
  }

  it('R17 — H1 OFF + budget_exceeded keeps the existing advisory behaviour exactly', async () => {
    delete process.env.H1_SPEND_GATE
    rpc.mockResolvedValue(row(false, 'budget_exceeded', 'res-2'))
    const { reserveSpend } = await import('@/lib/cost/budget-gate')
    const v = await reserveSpend({ projectId: 'p', estimatedSek: 3 })

    expect(v.allowed, 'a ceiling refusal is still downgraded during rollout').toBe(true)
    expect(v.advisoryOverride).toBe(true)
    expect(v.wouldAllow).toBe(false)
  })

  it('R17b — H1 ON + budget_exceeded refuses, unchanged', async () => {
    process.env.H1_SPEND_GATE = '1'
    rpc.mockResolvedValue(row(false, 'budget_exceeded', 'res-2'))
    const { reserveSpend } = await import('@/lib/cost/budget-gate')
    const v = await reserveSpend({ projectId: 'p', estimatedSek: 3 })
    expect(v.allowed).toBe(false)
    expect(v.advisoryOverride).toBe(false)
  })

  it('R17c — an unkeyed caller sends p_idempotency_key: null to the RPC', async () => {
    // Scope, precisely. This proves only the TypeScript half: an unkeyed caller
    // supplies no key. It does NOT prove the database cannot answer `replay_*`
    // for such a call — an earlier version of this test claimed that while only
    // faking the RPC's return value, which proved nothing about the RPC.
    //
    // The database-side property is proven against the real function in
    // `budget-scopes-sql.test.ts`: "an UNKEYED call can never receive a replay
    // verdict, even beside a live keyed one".
    delete process.env.H1_SPEND_GATE
    rpc.mockResolvedValue(row(true, 'ok', 'res-3'))
    const { reserveSpend } = await import('@/lib/cost/budget-gate')
    const v = await reserveSpend({ projectId: 'p', estimatedSek: 3 })
    expect(v.allowed).toBe(true)
    expect(rpc).toHaveBeenCalledWith('budget_reserve',
      expect.objectContaining({ p_idempotency_key: null }))
  })

  it('R16b — H1 ON + replay is refused too: the ruling is flag-independent', async () => {
    process.env.H1_SPEND_GATE = '1'
    rpc.mockResolvedValue(row(false, 'replay_in_flight', 'res-first-caller'))
    const { reserveSpend } = await import('@/lib/cost/budget-gate')
    const v = await reserveSpend({ projectId: 'p', estimatedSek: 3, idempotencyKey: 'k' })
    expect(v.allowed).toBe(false)
  })
})
