import { describe, it, expect, afterEach } from 'vitest'
import { fencedRunUpdate, fencedError, isFencedError, isFencingEnabled } from '@/lib/ai/fencing'

/**
 * H1.P5 Commit 2 — claim_id fencing.
 *
 * Unit-level proof of the fencing CONTRACT (flag gating, conditional vs unconditional
 * write, zero-row → fenced, sentinel error). The DB-level behavior (claim_runs stamps a
 * token, the reaper clears it, a stale-token write matches 0 rows) is proven against the
 * staging branch h1p5-staging via the SQL matrix F1–F3.
 */

/**
 * Fake Supabase client recording how a runs UPDATE was issued.
 *   from('runs').update(payload).eq('id',id)                          → unconditional (awaited)
 *   from('runs').update(payload).eq('id',id).eq('claim_id',c).select  → fenced (returns rows)
 */
function fakeDb(opts: { rows?: { id: string }[]; error?: { message: string } | null } = {}) {
  const calls = { payload: undefined as Record<string, unknown> | undefined, eqs: [] as [string, unknown][], selected: false }
  const chain: any = {
    eq: (col: string, val: unknown) => { calls.eqs.push([col, val]); return chain },
    select: () => { calls.selected = true; return Promise.resolve({ data: opts.rows ?? [{ id: 'r1' }], error: opts.error ?? null }) },
    // thenable so `await update(...).eq(...)` resolves on the unconditional path
    then: (resolve: (v: unknown) => void) => resolve({ error: null }),
  }
  const db = { from: () => ({ update: (payload: Record<string, unknown>) => { calls.payload = payload; return chain } }) }
  return { db, calls }
}

afterEach(() => { delete process.env.H1_FENCING })

describe('isFencingEnabled — flag gate (default OFF)', () => {
  it('is false unless H1_FENCING === "1"', () => {
    delete process.env.H1_FENCING; expect(isFencingEnabled()).toBe(false)
    process.env.H1_FENCING = '0'; expect(isFencingEnabled()).toBe(false)
    process.env.H1_FENCING = 'true'; expect(isFencingEnabled()).toBe(false)
    process.env.H1_FENCING = '1'; expect(isFencingEnabled()).toBe(true)
  })
})

describe('fencedRunUpdate — flag OFF', () => {
  it('writes UNCONDITIONALLY (no claim_id eq, no select) and is never fenced', async () => {
    const { db, calls } = fakeDb()
    const res = await fencedRunUpdate(db, 'run1', 'claimA', { status: 'done' })
    expect(res).toEqual({ fenced: false })
    expect(calls.payload).toEqual({ status: 'done' })
    expect(calls.selected).toBe(false)
    expect(calls.eqs).toEqual([['id', 'run1']]) // only id — NOT conditioned on claim_id
  })
})

describe('fencedRunUpdate — flag ON', () => {
  it('conditions on claim_id and succeeds (1 row) → not fenced', async () => {
    process.env.H1_FENCING = '1'
    const { db, calls } = fakeDb({ rows: [{ id: 'run1' }] })
    const res = await fencedRunUpdate(db, 'run1', 'claimA', { status: 'done' })
    expect(res).toEqual({ fenced: false })
    expect(calls.selected).toBe(true)
    expect(calls.eqs).toEqual([['id', 'run1'], ['claim_id', 'claimA']])
  })

  it('zero rows (token rotated) → fenced', async () => {
    process.env.H1_FENCING = '1'
    const { db } = fakeDb({ rows: [] })
    const res = await fencedRunUpdate(db, 'run1', 'staleClaim', { status: 'done' })
    expect(res).toEqual({ fenced: true })
  })

  it('falls back to UNCONDITIONAL when no claim_id token is present (legacy manual run)', async () => {
    process.env.H1_FENCING = '1'
    const { db, calls } = fakeDb()
    const res = await fencedRunUpdate(db, 'run1', undefined, { status: 'done' })
    expect(res).toEqual({ fenced: false })
    expect(calls.selected).toBe(false)
    expect(calls.eqs).toEqual([['id', 'run1']])
  })

  it('throws (does NOT silently fence) on a real DB error', async () => {
    process.env.H1_FENCING = '1'
    const { db } = fakeDb({ rows: [], error: { message: 'connection reset' } })
    await expect(fencedRunUpdate(db, 'run1', 'claimA', { status: 'done' })).rejects.toThrow(/connection reset/)
  })
})

describe('fenced sentinel error', () => {
  it('fencedError is recognized by isFencedError; ordinary errors are not', () => {
    expect(isFencedError(fencedError('run1'))).toBe(true)
    expect(fencedError('run1').message).toMatch(/^fenced: run run1 reclaimed/)
    expect(isFencedError(new Error('Agent not found'))).toBe(false)
    expect(isFencedError(null)).toBe(false)
    expect(isFencedError('fenced: string not error')).toBe(false)
  })
})
